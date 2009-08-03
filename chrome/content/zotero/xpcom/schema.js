/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright (c) 2006  Center for History and New Media
                        George Mason University, Fairfax, Virginia, USA
                        http://chnm.gmu.edu
    
    Licensed under the Educational Community License, Version 1.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at
    
    http://www.opensource.org/licenses/ecl1.php
    
    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.
    
    ***** END LICENSE BLOCK *****
*/

Zotero.Schema = new function(){
	this.userDataUpgradeRequired = userDataUpgradeRequired;
	this.showUpgradeWizard = showUpgradeWizard;
	this.updateSchema = updateSchema;
	this.stopRepositoryTimer = stopRepositoryTimer;
	
	this.skipDefaultData = false;
	this.dbInitialized = false;
	this.goToChangeLog = false;
	
	var _dbVersions = [];
	var _schemaVersions = [];
	var _repositoryTimer;
	var _remoteUpdateInProgress = false;
	
	var self = this;
	
	function userDataUpgradeRequired() {
		var dbVersion = _getDBVersion('userdata');
		var schemaVersion = _getSchemaSQLVersion('userdata');
		
		return dbVersion && (dbVersion < schemaVersion);
	}
	
	
	function showUpgradeWizard() {
		var dbVersion = _getDBVersion('userdata');
		var schemaVersion = _getSchemaSQLVersion('userdata');
		
		var ww = Components.classes["@mozilla.org/embedcomp/window-watcher;1"]
				   .getService(Components.interfaces.nsIWindowWatcher);
		var obj = { Zotero: Zotero, data: { success: false } };
		var io = { wrappedJSObject: obj };
		var win = ww.openWindow(null, "chrome://zotero/content/upgrade.xul",
					"zotero-schema-upgrade", "chrome,centerscreen,modal", io);
		
		if (obj.data.e) {
			if (obj.data.e.name && obj.data.e.name == "NS_ERROR_FAILURE" && obj.data.e.message.match(/nsIFile\.moveTo/)) {
				Components.utils.reportError(obj.data.e);
				return false;
			}
			
			var ww = Components.classes["@mozilla.org/embedcomp/window-watcher;1"]
					   .getService(Components.interfaces.nsIWindowWatcher);
			var data = {
				msg: obj.data.msg,
				e: obj.data.e,
				extraData: "Schema upgrade from " + dbVersion + " to " + schemaVersion
			};
			var io = { wrappedJSObject: { Zotero: Zotero, data:  data } };
			var win = ww.openWindow(null, "chrome://zotero/content/errorReport.xul",
						"zotero-error-report", "chrome,centerscreen,modal", io);
		}
		
		return obj.data.success;
	}
	
	
	/*
	 * Checks if the DB schema exists and is up-to-date, updating if necessary
	 */
	function updateSchema(){
		var dbVersion = _getDBVersion('userdata');
		
		// 'schema' check is for old (<= 1.0b1) schema system,
		// 'user' is for pre-1.0b2 'user' table
		if (!dbVersion && !_getDBVersion('schema') && !_getDBVersion('user')){
			Zotero.debug('Database does not exist -- creating\n');
			_initializeSchema();
			return;
		}
		
		var schemaVersion = _getSchemaSQLVersion('userdata');
		
		try {
			Zotero.UnresponsiveScriptIndicator.disable();
			
			// If upgrading userdata, make backup of database first
			if (dbVersion < schemaVersion){
				Zotero.DB.backupDatabase(dbVersion);
			}
			
			Zotero.DB.beginTransaction();
			
			try {
				// Old schema system
				if (!dbVersion){
					// Check for pre-1.0b2 'user' table
					 var user = _getDBVersion('user');
					 if (user)
					 {
						 dbVersion = user;
						 var sql = "UPDATE version SET schema=? WHERE schema=?";
						 Zotero.DB.query(sql, ['userdata', 'user']);
					 }
					 else
					 {
						 dbVersion = 0;
					 }
				}
				
				var up2 = _updateSchema('system');
				var up1 = _migrateUserDataSchema(dbVersion);
				var up3 = _updateSchema('triggers');
				
				Zotero.DB.commitTransaction();
			}
			catch(e){
				Zotero.debug(e);
				Zotero.DB.rollbackTransaction();
				throw(e);
			}
			
			if (up1) {
				// Upgrade seems to have been a success -- delete any previous backups
				var maxPrevious = dbVersion - 1;
				var file = Zotero.getZoteroDirectory();
				var toDelete = [];
				try {
					var files = file.directoryEntries;
					while (files.hasMoreElements()) {
						var file = files.getNext();
						file.QueryInterface(Components.interfaces.nsIFile);
						if (file.isDirectory()) {
							continue;
						}
						var matches = file.leafName.match(/zotero\.sqlite\.([0-9]{2,})\.bak/);
						if (!matches) {
							continue;
						}
						if (matches[1]>=28 && matches[1]<=maxPrevious) {
							toDelete.push(file);
						}
					}
					for each(var file in toDelete) {
						Zotero.debug('Removing previous backup file ' + file.leafName);
						file.remove(false);
					}
				}
				catch (e) {
					Zotero.debug(e);
				}
			}
			
			var up4 = this.updateBundledFiles();
			
			if (up2 || up3 || up4) {
				// Run a manual scraper update if upgraded and pref set
				if (Zotero.Prefs.get('automaticScraperUpdates')){
					this.updateFromRepository(2);
				}
			}
		}
		finally {
			Zotero.UnresponsiveScriptIndicator.enable();
		}
		return;
	}
	
	
	/**
	 * Update styles and translators in data directory with versions from
	 * ZIP file (XPI) or directory (SVN) in extension directory
	 *
	 * @param	{String}	[mode]					'translators' or 'styles'
	 * @param	{Boolean}	[skipDeleteUpdated]		Skip updating of the file deleting version --
	 *												since deleting uses a single version table key,
	 * 												it should only be updated the last time through
	 */
	this.updateBundledFiles = function (mode, skipDeleteUpdate) {
		if (!mode) {
			var up1 = this.updateBundledFiles('translators', true);
			var up2 = this.updateBundledFiles('styles');
			return up1 && up2;
		}
		
		switch (mode) {
			case "translators":
				var titleField = 'label';
				var fileExt = ".js";
				break;
			
			case "styles":
				var titleField = 'title';
				var fileExt = ".csl";
				var hiddenDir = Zotero.getStylesDirectory();
				hiddenDir.append('hidden');
				break;
			
			default:
				throw ("Invalid mode '" + mode + "' in Zotero.Schema.updateBundledFiles()");
		}
		
		var modes = mode;
		mode = mode.substr(0, mode.length - 1);
		var Mode = mode[0].toUpperCase() + mode.substr(1);
		var Modes = Mode + "s";
		
		var extDir = Zotero.getInstallDirectory();
		
		var repotime = extDir.clone();
		repotime.append('repotime.txt');
		repotime = Zotero.File.getContents(repotime);
		var date = Zotero.Date.sqlToDate(repotime, true);
		repotime = Zotero.Date.toUnixTimestamp(date);
		
		var zipFile = extDir.clone();
		zipFile.append(modes + ".zip");
		
		var fileNameRE = new RegExp("^[^\.].+\\" + fileExt + "$");
		
		var destDir = Zotero["get" + Modes + "Directory"]();
		
		// If directory is empty, force reinstall
		var forceReinstall = true;
		var entries = destDir.directoryEntries;
		while (entries.hasMoreElements()) {
			var file = entries.getNext();
			file.QueryInterface(Components.interfaces.nsIFile);
			if (!file.leafName.match(fileNameRE) || file.isDirectory()) {
				continue;
			}
			// Not empty
			forceReinstall = false;
			break;
		}
		
		//
		// Delete obsolete files
		//
		var sql = "SELECT version FROM version WHERE schema='delete'";
		var lastVersion = Zotero.DB.valueQuery(sql);
		
		var deleted = extDir.clone();
		deleted.append('deleted.txt');
		deleted = Zotero.File.getContents(deleted);
		deleted = deleted.match(/^([^\s]+)/gm);
		var version = deleted.shift();
		
		if (!lastVersion || lastVersion < version) {
			var toDelete = [];
			var entries = destDir.directoryEntries;
			while (entries.hasMoreElements()) {
				var file = entries.getNext();
				file.QueryInterface(Components.interfaces.nsIFile);
				
				if (!file.exists() // symlink to non-existent file
						|| file.isDirectory()) {
					continue;
				}
				
				// Delete incorrectly named files saved via repo pre-1.5b3
				switch (file.leafName) {
					case 'ama':
					case 'apa':
					case 'apsa':
					case 'asa':
					case 'chicago-author-date':
					case 'chicago-fullnote-bibliography':
					case 'chicago-note':
					case 'chicago-note-bibliography':
					case 'harvard1':
					case 'ieee':
					case 'mhra':
					case 'mhra_note_without_bibliography':
					case 'mla':
					case 'nature':
					case 'nlm':
					case 'vancouver':
						toDelete.push(file);
						continue;
				}
				
				if (forceReinstall || !file.leafName.match(fileNameRE)) {
					continue;
				}
				
				var newObj = new Zotero[Mode](file);
				if (deleted.indexOf(newObj[mode + "ID"]) == -1) {
					continue;
				}
				toDelete.push(file);
			}
			
			for each(var file in toDelete) {
				Zotero.debug("Deleting " + file.path);
				try {
					file.remove(false);
				}
				catch (e) {
					Zotero.debug(e);
				}
			}
			
			if (!skipDeleteUpdate) {
				sql = "REPLACE INTO version (schema, version) VALUES ('delete', ?)";
				Zotero.DB.query(sql, version);
			}
		}
		
		//
		// Update files
		//
		var sql = "SELECT version FROM version WHERE schema=?";
		var lastModTime = Zotero.DB.valueQuery(sql, modes);
		
		if (zipFile.exists()) {
			var modTime = Math.round(zipFile.lastModifiedTime / 1000);
			
			if (!forceReinstall && lastModTime && modTime <= lastModTime) {
				Zotero.debug("Installed " + modes + " are up-to-date with " + modes + ".zip");
				return false;
			}
			
			Zotero.debug("Updating installed " + modes + " from " + modes + ".zip");
			
			var zipReader = Components.classes["@mozilla.org/libjar/zip-reader;1"]
					.getService(Components.interfaces.nsIZipReader);
			zipReader.open(zipFile);
			var tmpDir = Zotero.getTempDirectory();
			var entries = zipReader.findEntries(null);
			while (entries.hasMore()) {
				var entry = entries.getNext();
				
				var tmpFile = tmpDir.clone();
				tmpFile.append(entry);
				if (tmpFile.exists()) {
					tmpFile.remove(false);
				}
				zipReader.extract(entry, tmpFile);
				var newObj = new Zotero[Mode](tmpFile);
				
				var existingObj = Zotero[Modes].get(newObj[mode + "ID"]);
				if (!existingObj) {
					Zotero.debug("Installing " + mode + " '" + newObj[titleField] + "'");
				}
				else {
					Zotero.debug("Updating "
						+ (existingObj.hidden ? "hidden " : "")
						+ mode + " '" + existingObj[titleField] + "'");
					if (existingObj.file.exists()) {
						existingObj.file.remove(false);
					}
				}
				
				if (mode == 'translator') {
					var fileName = Zotero.File.getValidFileName(newObj[titleField]) + fileExt;
					
					var destFile = destDir.clone();
					destFile.append(fileName);
					if (destFile.exists()) {
						var msg = "Overwriting translator with same filename '"
							+ fileName + "'";
						Zotero.debug(msg, 1);
						Components.utils.reportError(msg + " in Zotero.Schema.updateBundledFiles()");
						destFile.remove(false);
					}
				}
				else if (mode == 'style') {
					var fileName = tmpFile.leafName;
				}
				
				if (!existingObj || !existingObj.hidden) {
					tmpFile.moveTo(destDir, fileName);
				}
				else {
					tmpFile.moveTo(hiddenDir, fileName);
				}
			}
			zipReader.close();
		}
		else {
			var sourceDir = extDir.clone();
			sourceDir.append(modes);
			if (!sourceDir.exists()) {
				Components.utils.reportError("No " + modes + " ZIP file or directory "
					+ " in Zotero.Schema.updateBundledFiles()");
				return false;
			}
			
			var entries = sourceDir.directoryEntries;
			var modTime = 0;
			var sourceFilesExist = false;
			while (entries.hasMoreElements()) {
				var file = entries.getNext();
				file.QueryInterface(Components.interfaces.nsIFile);
				// File might not exist in an SVN build with style symlinks
				if (!file.exists()
						|| !file.leafName.match(fileNameRE)
						|| file.isDirectory()) {
					continue;
				}
				sourceFilesExist = true;
				var fileModTime = Math.round(file.lastModifiedTime / 1000);
				if (fileModTime > modTime) {
					modTime = fileModTime;
				}
			}
			
			// Don't attempt installation for SVN build with missing styles
			if (!sourceFilesExist) {
				Zotero.debug("No source " + mode + " files exist -- skipping update");
				return false;
			}
			
			if (!forceReinstall && lastModTime && modTime <= lastModTime) {
				Zotero.debug("Installed " + modes + " are up-to-date with " + modes + " directory");
				return false;
			}
			
			Zotero.debug("Updating installed " + modes + " from " + modes + " directory");
			
			var entries = sourceDir.directoryEntries;
			while (entries.hasMoreElements()) {
				var file = entries.getNext();
				file.QueryInterface(Components.interfaces.nsIFile);
				if (!file.exists() || !file.leafName.match(fileNameRE) || file.isDirectory()) {
					continue;
				}
				var newObj = new Zotero[Mode](file);
				var existingObj = Zotero[Modes].get(newObj[mode + "ID"]);
				if (!existingObj) {
					Zotero.debug("Installing " + mode + " '" + newObj[titleField] + "'");
				}
				else {
					Zotero.debug("Updating "
						+ (existingObj.hidden ? "hidden " : "")
						+ mode + " '" + existingObj[titleField] + "'");
					if (existingObj.file.exists()) {
						existingObj.file.remove(false);
					}
				}
				
				if (mode == 'translator') {
					var fileName = Zotero.File.getValidFileName(newObj[titleField]) + fileExt
				}
				else if (mode == 'style') {
					var fileName = file.leafName;
				}
				
				try {
					var destFile = destDir.clone();
					destFile.append(fileName);
					if (destFile.exists()) {
						var msg = "Overwriting " + mode + " with same filename '"
							+ fileName + "'";
						Zotero.debug(msg, 1);
						Components.utils.reportError(msg + " in Zotero.Schema.updateBundledFiles()");
						destFile.remove(false);
					}
					
					if (!existingObj || !existingObj.hidden) {
						file.copyTo(destDir, fileName);
					}
					else {
						file.copyTo(hiddenDir, fileName);
					}
				}
				catch (e) {
					Components.utils.reportError("Error copying file " + fileName + ": " + e);
				}
			}
		}
		
		Zotero.DB.beginTransaction();
		
		var sql = "REPLACE INTO version VALUES (?, ?)";
		Zotero.DB.query(sql, [modes, modTime]);
		
		var sql = "REPLACE INTO version VALUES ('repository', ?)";
		Zotero.DB.query(sql, repotime);
		
		Zotero.DB.commitTransaction();
		
		Zotero[Modes].init();
		return true;
	}
	
	
	/**
	 * Send XMLHTTP request for updated translators and styles to the central repository
	 *
	 * @param	{Boolean}	force	Force a repository query regardless of how
	 *									long it's been since the last check
	 * @param	{Function}	callback
	 */
	this.updateFromRepository = function (force, callback) {
		// Little hack to manually update CSLs from repo on upgrades
		if (!force && Zotero.Prefs.get('automaticScraperUpdates')) {
			var syncTargetVersion = 3; // increment this when releasing new version that requires it
			var syncVersion = _getDBVersion('sync');
			if (syncVersion < syncTargetVersion) {
				force = true;
				var forceCSLUpdate = true;
			}
		}
		
		if (!force){
			if (_remoteUpdateInProgress) {
				Zotero.debug("A remote update is already in progress -- not checking repository");
				return false;
			}
			
			// Check user preference for automatic updates
			if (!Zotero.Prefs.get('automaticScraperUpdates')){
				Zotero.debug('Automatic repository updating disabled -- not checking repository', 4);
				return false;
			}
			
			// Determine the earliest local time that we'd query the repository again
			var nextCheck = new Date();
			nextCheck.setTime((parseInt(_getDBVersion('lastcheck'))
				+ ZOTERO_CONFIG['REPOSITORY_CHECK_INTERVAL']) * 1000); // JS uses ms
			var now = new Date();
			
			// If enough time hasn't passed, don't update
			if (now < nextCheck){
				Zotero.debug('Not enough time since last update -- not checking repository', 4);
				// Set the repository timer to the remaining time
				_setRepositoryTimer(Math.round((nextCheck.getTime() - now.getTime()) / 1000));
				return false;
			}
		}
		
		// If transaction already in progress, delay by ten minutes
		if (Zotero.DB.transactionInProgress()){
			Zotero.debug('Transaction in progress -- delaying repository check', 4)
			_setRepositoryTimer(600);
			return false;
		}
		
		// Get the last timestamp we got from the server
		var lastUpdated = _getDBVersion('repository');
		
		var url = ZOTERO_CONFIG['REPOSITORY_URL'] + '/updated?'
			+ (lastUpdated ? 'last=' + lastUpdated + '&' : '')
			+ 'version=' + Zotero.version;
		
		Zotero.debug('Checking repository for updates');
		
		_remoteUpdateInProgress = true;
		
		if (force) {
			if (force == 2) {
				url += '&m=2';
			}
			else {
				url += '&m=1';
			}
			
			// Force updating of all public CSLs
			if (forceCSLUpdate) {
				url += '&cslup=' + syncTargetVersion;
			}
		}
		
		var get = Zotero.Utilities.HTTP.doGet(url, function (xmlhttp) {
			var updated = _updateFromRepositoryCallback(xmlhttp, !!force);
			if (callback) {
				callback(xmlhttp, updated)
			}
		});
		
		// TODO: instead, add an observer to start and stop timer on online state change
		if (!get){
			Zotero.debug('Browser is offline -- skipping check');
			_setRepositoryTimer(ZOTERO_CONFIG['REPOSITORY_RETRY_INTERVAL']);
		}
	}
	
	
	function stopRepositoryTimer(){
		if (_repositoryTimer){
			Zotero.debug('Stopping repository check timer');
			_repositoryTimer.cancel();
		}
	}
	
	
	this.resetTranslatorsAndStyles = function (callback) {
		Zotero.debug("Resetting translators and styles");
		
		var sql = "DELETE FROM version WHERE schema IN "
			+ "('translators', 'styles', 'repository', 'lastcheck')";
		Zotero.DB.query(sql);
		_dbVersions.repository = null;
		_dbVersions.lastcheck = null;
		
		var translatorsDir = Zotero.getTranslatorsDirectory();
		translatorsDir.remove(true);
		Zotero.getTranslatorsDirectory(); // recreate directory
		Zotero.Translators.init();
		this.updateBundledFiles('translators');
		
		var stylesDir = Zotero.getStylesDirectory();
		stylesDir.remove(true);
		Zotero.getStylesDirectory(); // recreate directory
		Zotero.Styles.init();
		this.updateBundledFiles('styles');
		
		// Run a manual update from repository if pref set
		if (Zotero.Prefs.get('automaticScraperUpdates')) {
			this.updateFromRepository(2, callback);
		}
	}
	
	
	/////////////////////////////////////////////////////////////////
	//
	// Private methods
	//
	/////////////////////////////////////////////////////////////////
	
	/*
	 * Retrieve the DB schema version
	 */
	function _getDBVersion(schema){
		if (_dbVersions[schema]){
			return _dbVersions[schema];
		}
		
		if (Zotero.DB.tableExists('version')){
			var dbVersion = Zotero.DB.valueQuery("SELECT version FROM "
				+ "version WHERE schema='" + schema + "'");
			_dbVersions[schema] = dbVersion;
			return dbVersion;
		}
		return false;
	}
	
	
	/*
	 * Retrieve the version from the top line of the schema SQL file
	 */
	function _getSchemaSQLVersion(schema){
		if (!schema){
			throw ('Schema type not provided to _getSchemaSQLVersion()');
		}
		
		var schemaFile = schema + '.sql';
		
		if (_schemaVersions[schema]){
			return _schemaVersions[schema];
		}
		
		var file = Components.classes["@mozilla.org/extensions/manager;1"]
                    .getService(Components.interfaces.nsIExtensionManager)
                    .getInstallLocation(ZOTERO_CONFIG['GUID'])
                    .getItemLocation(ZOTERO_CONFIG['GUID']); 
		file.append(schemaFile);
		
		// Open an input stream from file
		var istream = Components.classes["@mozilla.org/network/file-input-stream;1"]
			.createInstance(Components.interfaces.nsIFileInputStream);
		istream.init(file, 0x01, 0444, 0);
		istream.QueryInterface(Components.interfaces.nsILineInputStream);
		
		var line = {};
		
		// Fetch the schema version from the first line of the file
		istream.readLine(line);
		var schemaVersion = line.value.match(/-- ([0-9]+)/)[1];
		istream.close();
		
		_schemaVersions[schema] = schemaVersion;
		return schemaVersion;
	}
	
	
	/*
	 * Load in SQL schema
	 *
	 * Returns the contents of an SQL file for feeding into query()
	 */
	function _getSchemaSQL(schema){
		if (!schema){
			throw ('Schema type not provided to _getSchemaSQL()');
		}
		
		var schemaFile = schema + '.sql';
		
		// We pull the schema from an external file so we only have to process
		// it when necessary
		var file = Components.classes["@mozilla.org/extensions/manager;1"]
                    .getService(Components.interfaces.nsIExtensionManager)
                    .getInstallLocation(ZOTERO_CONFIG['GUID'])
                    .getItemLocation(ZOTERO_CONFIG['GUID']); 
		file.append(schemaFile);
		
		// Open an input stream from file
		var istream = Components.classes["@mozilla.org/network/file-input-stream;1"]
			.createInstance(Components.interfaces.nsIFileInputStream);
		istream.init(file, 0x01, 0444, 0);
		istream.QueryInterface(Components.interfaces.nsILineInputStream);
		
		var line = {}, sql = '', hasmore;
		
		// Skip the first line, which contains the schema version
		istream.readLine(line);
		//var schemaVersion = line.value.match(/-- ([0-9]+)/)[1];
		
		do {
			hasmore = istream.readLine(line);
			sql += line.value + "\n";
		} while(hasmore);
		
		istream.close();
		
		return sql;
	}
	
	
	/*
	 * Determine the SQL statements necessary to drop the tables and indexed
	 * in a given schema file
	 *
	 * NOTE: This is not currently used.
	 *
	 * Returns the SQL statements as a string for feeding into query()
	 */
	function _getDropCommands(schema){
		if (!schema){
			throw ('Schema type not provided to _getSchemaSQL()');
		}
		
		var schemaFile = schema + '.sql';
		
		// We pull the schema from an external file so we only have to process
		// it when necessary
		var file = Components.classes["@mozilla.org/extensions/manager;1"]
                    .getService(Components.interfaces.nsIExtensionManager)
                    .getInstallLocation(ZOTERO_CONFIG['GUID'])
                    .getItemLocation(ZOTERO_CONFIG['GUID']); 
		file.append(schemaFile);
		
		// Open an input stream from file
		var istream = Components.classes["@mozilla.org/network/file-input-stream;1"]
			.createInstance(Components.interfaces.nsIFileInputStream);
		istream.init(file, 0x01, 0444, 0);
		istream.QueryInterface(Components.interfaces.nsILineInputStream);
		
		var line = {}, str = '', hasmore;
		
		// Skip the first line, which contains the schema version
		istream.readLine(line);
		
		do {
			hasmore = istream.readLine(line);
			var matches =
				line.value.match(/CREATE (TABLE|INDEX) IF NOT EXISTS ([^\s]+)/);
			if (matches){
				str += "DROP " + matches[1] + " IF EXISTS " + matches[2] + ";\n";
			}
		} while(hasmore);
		
		istream.close();
		
		return str;
	}
	
	
	/*
	 * Create new DB schema
	 */
	function _initializeSchema(){
		Zotero.DB.beginTransaction();
		try {
			// Enable auto-vacuuming
			Zotero.DB.query("PRAGMA page_size = 4096");
			Zotero.DB.query("PRAGMA encoding = 'UTF-8'");
			Zotero.DB.query("PRAGMA auto_vacuum = 1");
			
			Zotero.DB.query(_getSchemaSQL('system'));
			Zotero.DB.query(_getSchemaSQL('userdata'));
			Zotero.DB.query(_getSchemaSQL('triggers'));
			
			_updateDBVersion('system', _getSchemaSQLVersion('system'));
			_updateDBVersion('userdata', _getSchemaSQLVersion('userdata'));
			_updateDBVersion('triggers', _getSchemaSQLVersion('triggers'));
			
			if (!Zotero.Schema.skipDefaultData) {
				/*
				TODO: uncomment for release
				var sql = "INSERT INTO items VALUES(1, 14, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'AJ4PT6IT')";
				Zotero.DB.query(sql);
				var sql = "INSERT INTO itemAttachments VALUES (1, NULL, 3, 'text/html', 25, NULL, NULL)";
				Zotero.DB.query(sql);
				var sql = "INSERT INTO itemDataValues VALUES (?, ?)";
				Zotero.DB.query(sql, [1, "Zotero - " + Zotero.getString('install.quickStartGuide')]);
				var sql = "INSERT INTO itemData VALUES (1, 110, 1)";
				Zotero.DB.query(sql);
				var sql = "INSERT INTO itemDataValues VALUES (2, 'http://www.zotero.org/documentation/quick_start_guide')";
				Zotero.DB.query(sql);
				var sql = "INSERT INTO itemData VALUES (1, 1, 2)";
				Zotero.DB.query(sql);
				var sql = "INSERT INTO itemDataValues VALUES (3, CURRENT_TIMESTAMP)";
				Zotero.DB.query(sql);
				var sql = "INSERT INTO itemData VALUES (1, 27, 3)";
				Zotero.DB.query(sql);
				var sql = "INSERT INTO itemNotes (itemID, sourceItemID, note) VALUES (1, NULL, ?)";
				var msg = Zotero.getString('install.quickStartGuide.message.welcome')
					+ " " + Zotero.getString('install.quickStartGuide.message.clickViewPage')
					+ "\n\n" + Zotero.getString('install.quickStartGuide.message.thanks');
				Zotero.DB.query(sql, msg);
				*/
			}
			Zotero.DB.commitTransaction();
			
			self.dbInitialized = true;
		}
		catch(e){
			Zotero.debug(e, 1);
			Components.utils.reportError(e);
			Zotero.DB.rollbackTransaction();
			alert('Error initializing Zotero database');
			throw(e);
		}
	}
	
	
	/*
	 * Update a DB schema version tag in an existing database
	 */
	function _updateDBVersion(schema, version){
		_dbVersions[schema] = version;
		var sql = "REPLACE INTO version (schema,version) VALUES (?,?)";
		return Zotero.DB.query(sql, [{'string':schema},{'int':version}]);
	}
	
	
	function _updateSchema(schema){
		var dbVersion = _getDBVersion(schema);
		var schemaVersion = _getSchemaSQLVersion(schema);
		
		if (dbVersion == schemaVersion){
			return false;
		}
		else if (dbVersion < schemaVersion){
			Zotero.DB.beginTransaction();
			try {
				Zotero.DB.query(_getSchemaSQL(schema));
				_updateDBVersion(schema, schemaVersion);
				Zotero.DB.commitTransaction();
			}
			catch (e){
				Zotero.debug(e, 1);
				Zotero.DB.rollbackTransaction();
				throw(e);
			}
			return true;
		}
		
		throw ("Zotero '" + schema + "' DB version (" + dbVersion
			+ ") is newer than SQL file (" + schemaVersion + ")");
	}
	
	
	/**
	* Process the response from the repository
	**/
	function _updateFromRepositoryCallback(xmlhttp, manual){
		if (!xmlhttp.responseXML){
			try {
				if (xmlhttp.status>1000){
					Zotero.debug('No network connection', 2);
				}
				else {
					Zotero.debug('Invalid response from repository', 2);
				}
			}
			catch (e){
				Zotero.debug('Repository cannot be contacted');
			}
			
			if (!manual){
				_setRepositoryTimer(ZOTERO_CONFIG['REPOSITORY_RETRY_INTERVAL']);
			}
			
			_remoteUpdateInProgress = false;
			return false;
		}
		
		var currentTime = xmlhttp.responseXML.
			getElementsByTagName('currentTime')[0].firstChild.nodeValue;
		var translatorUpdates = xmlhttp.responseXML.getElementsByTagName('translator');
		var styleUpdates = xmlhttp.responseXML.getElementsByTagName('style');
		
		Zotero.DB.beginTransaction();
		
		try {
			var re = /cslup=([0-9]+)/;
			var matches = re.exec(xmlhttp.channel.URI.spec);
			if (matches) {
				_updateDBVersion('sync', matches[1]);
			}
		}
		catch (e) {
			Zotero.debug(e);
		}
		
		// Store the timestamp provided by the server
		_updateDBVersion('repository', currentTime);
		
		if (!manual){
			// And the local timestamp of the update time
			var d = new Date();
			_updateDBVersion('lastcheck', Math.round(d.getTime()/1000)); // JS uses ms
		}
		
		if (!translatorUpdates.length && !styleUpdates.length){
			Zotero.debug('All translators and styles are up-to-date');
			Zotero.DB.commitTransaction();
			if (!manual){
				_setRepositoryTimer(ZOTERO_CONFIG['REPOSITORY_CHECK_INTERVAL']);
			}
			_remoteUpdateInProgress = false;
			return -1;
		}
		
		try {
			for (var i=0, len=translatorUpdates.length; i<len; i++){
				_translatorXMLToFile(translatorUpdates[i]);
			}
			
			for (var i=0, len=styleUpdates.length; i<len; i++){
				_styleXMLToFile(styleUpdates[i]);
			}
			
			// Rebuild caches
			Zotero.Translators.init();
			Zotero.Styles.init();
		}
		catch (e) {
			Zotero.debug(e, 1);
			Zotero.DB.rollbackTransaction();
			if (!manual){
				_setRepositoryTimer(ZOTERO_CONFIG['REPOSITORY_RETRY_INTERVAL']);
			}
			_remoteUpdateInProgress = false;
			return false;
		}
		
		Zotero.DB.commitTransaction();
		if (!manual){
			_setRepositoryTimer(ZOTERO_CONFIG['REPOSITORY_CHECK_INTERVAL']);
		}
		_remoteUpdateInProgress = false;
		return true;
	}
	
	
	/**
	* Set the interval between repository queries
	*
	* We add an additional two seconds to avoid race conditions
	**/
	function _setRepositoryTimer(interval){
		if (!interval){
			interval = ZOTERO_CONFIG['REPOSITORY_CHECK_INTERVAL'];
		}
		
		var fudge = 2; // two seconds
		var displayInterval = interval + fudge;
		var interval = (interval + fudge) * 1000; // convert to ms
		
		if (!_repositoryTimer || _repositoryTimer.delay!=interval){
			Zotero.debug('Setting repository check interval to ' + displayInterval + ' seconds');
			_repositoryTimer = Components.classes["@mozilla.org/timer;1"].
				createInstance(Components.interfaces.nsITimer);
			_repositoryTimer.initWithCallback({
				// implements nsITimerCallback
				notify: function(timer){
					Zotero.Schema.updateFromRepository();
				}
			}, interval, Components.interfaces.nsITimer.TYPE_REPEATING_SLACK);
		}
	}
	
	
	/**
	* Traverse an XML translator node from the repository and
	* update the local translators folder with the translator data
	**/
	function _translatorXMLToFile(xmlnode) {
		// Don't split >4K chunks into multiple nodes
		// https://bugzilla.mozilla.org/show_bug.cgi?id=194231
		xmlnode.normalize();
		var translatorID = xmlnode.getAttribute('id');
		var translator = Zotero.Translators.get(translatorID);
		
		// Delete local version of remote translators with priority 0
		if (xmlnode.getElementsByTagName('priority')[0].firstChild.nodeValue === "0") {
			if (translator && translator.file.exists()) {
				Zotero.debug("Deleting translator '" + translator.label + "'");
				translator.file.remove(false);
			}
			return false;
		}
		
		var metadata = {
			translatorID: translatorID,
			translatorType: parseInt(xmlnode.getAttribute('type')),
			label: xmlnode.getElementsByTagName('label')[0].firstChild.nodeValue,
			creator: xmlnode.getElementsByTagName('creator')[0].firstChild.nodeValue,
			target: (xmlnode.getElementsByTagName('target').item(0) &&
						xmlnode.getElementsByTagName('target')[0].firstChild)
					? xmlnode.getElementsByTagName('target')[0].firstChild.nodeValue
					: null,
			minVersion: xmlnode.getAttribute('minVersion'),
			maxVersion: xmlnode.getAttribute('maxVersion'),
			priority: parseInt(
				xmlnode.getElementsByTagName('priority')[0].firstChild.nodeValue
			),
			inRepository: true,
			lastUpdated: xmlnode.getAttribute('lastUpdated')
		};
		
		// detectCode can not exist or be empty
		var detectCode = (xmlnode.getElementsByTagName('detectCode').item(0) &&
					xmlnode.getElementsByTagName('detectCode')[0].firstChild)
				? xmlnode.getElementsByTagName('detectCode')[0].firstChild.nodeValue
				: null;
		var code = xmlnode.getElementsByTagName('code')[0].firstChild.nodeValue;
		code = (detectCode ? detectCode + "\n\n" : "") + code;
		
		return Zotero.Translators.save(metadata, code);
	}
	
	
	/**
	 * Traverse an XML style node from the repository and
	 * update the local styles folder with the style data
	 */
	function _styleXMLToFile(xmlnode) {
		// Don't split >4K chunks into multiple nodes
		// https://bugzilla.mozilla.org/show_bug.cgi?id=194231
		xmlnode.normalize();
		
		var uri = xmlnode.getAttribute('id');
		
		// Delete local style if CSL code is empty
		if (!xmlnode.getElementsByTagName('csl')[0].firstChild) {
			var style = Zotero.Styles.get(uri);
			if (style) {
				style.file.remove(null);
			}
			return;
		}
		
		var str = xmlnode.getElementsByTagName('csl')[0].firstChild.nodeValue;
		var style = Zotero.Styles.get(uri);
		if (style) {
			if (style.file.exists()) {
				style.file.remove(false);
			}
			var destFile = style.file;
		}
		else {
			// Get last part of URI for filename
			var matches = uri.match(/([^\/]+)$/);
			if (!matches) {
				throw ("Invalid style URI '" + uri + "' from repository");
			}
			var destFile = Zotero.getStylesDirectory();
			destFile.append(matches[1] + ".csl");
			if (destFile.exists()) {
				throw ("Different style with filename '" + matches[1]
					+ "' already exists in Zotero.Schema._styleXMLToFile()");
			}
		}
		
		Zotero.debug("Saving style '" + uri + "'");
		Zotero.File.putContents(destFile, str);
		return;
	}
	
	
	/*
	 * Migrate user data schema from an older version, preserving data
	 */
	function _migrateUserDataSchema(fromVersion){
		var toVersion = _getSchemaSQLVersion('userdata');
		
		if (fromVersion==toVersion){
			return false;
		}
		
		if (fromVersion > toVersion){
			throw("Zotero user data DB version is newer than SQL file");
		}
		
		Zotero.debug('Updating user data tables from version ' + fromVersion + ' to ' + toVersion);
		
		var ZU = new Zotero.Utilities;
		
		Zotero.DB.beginTransaction();
		
		try {
			// Step through version changes until we reach the current version
			//
			// Each block performs the changes necessary to move from the
			// previous revision to that one.
			for (var i=fromVersion + 1; i<=toVersion; i++){
				if (i==1){
					Zotero.DB.query("DELETE FROM version WHERE schema='schema'");
				}
				
				if (i==5){
					Zotero.DB.query("REPLACE INTO itemData SELECT itemID, 1, originalPath FROM itemAttachments WHERE linkMode=1");
					Zotero.DB.query("REPLACE INTO itemData SELECT itemID, 1, path FROM itemAttachments WHERE linkMode=3");
					Zotero.DB.query("REPLACE INTO itemData SELECT itemID, 27, dateAdded FROM items NATURAL JOIN itemAttachments WHERE linkMode IN (1,3)");
					Zotero.DB.query("UPDATE itemAttachments SET originalPath=NULL WHERE linkMode=1");
					Zotero.DB.query("UPDATE itemAttachments SET path=NULL WHERE linkMode=3");
					try { Zotero.DB.query("DELETE FROM fulltextItems WHERE itemID IS NULL"); } catch(e){}
				}
				
				if (i==6){
					Zotero.DB.query("CREATE TABLE creatorsTemp (creatorID INT, firstName INT, lastName INT, fieldMode INT)");
					Zotero.DB.query("INSERT INTO creatorsTemp SELECT * FROM creators");
					Zotero.DB.query("DROP TABLE creators");
					Zotero.DB.query("CREATE TABLE creators (\n    creatorID INT,\n    firstName INT,\n    lastName INT,\n    fieldMode INT,\n    PRIMARY KEY (creatorID)\n);");
					Zotero.DB.query("INSERT INTO creators SELECT * FROM creatorsTemp");
					Zotero.DB.query("DROP TABLE creatorsTemp");
				}
				
				if (i==7){
					Zotero.DB.query("DELETE FROM itemData WHERE fieldID=17");
					Zotero.DB.query("UPDATE itemData SET fieldID=64 WHERE fieldID=20");
					Zotero.DB.query("UPDATE itemData SET fieldID=69 WHERE fieldID=24 AND itemID IN (SELECT itemID FROM items WHERE itemTypeID=7)");
					Zotero.DB.query("UPDATE itemData SET fieldID=65 WHERE fieldID=24 AND itemID IN (SELECT itemID FROM items WHERE itemTypeID=8)");
					Zotero.DB.query("UPDATE itemData SET fieldID=66 WHERE fieldID=24 AND itemID IN (SELECT itemID FROM items WHERE itemTypeID=9)");
					Zotero.DB.query("UPDATE itemData SET fieldID=59 WHERE fieldID=24 AND itemID IN (SELECT itemID FROM items WHERE itemTypeID=12)");
				}
				
				if (i==8){
					Zotero.DB.query("DROP TABLE IF EXISTS translators");
					Zotero.DB.query("DROP TABLE IF EXISTS csl");
				}
				
				// 1.0b2 (1.0.0b2.r1)
				
				if (i==9){
					var attachments = Zotero.DB.query("SELECT itemID, linkMode, path FROM itemAttachments");
					for each(var row in attachments){
						var file = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
						try {
							var refDir = (row.linkMode==Zotero.Attachments.LINK_MODE_LINKED_FILE) ? Zotero.getZoteroDirectory() : Zotero.getStorageDirectory();
							file.setRelativeDescriptor(refDir, row.path);
							Zotero.DB.query("UPDATE itemAttachments SET path=? WHERE itemID=?", [file.persistentDescriptor, row.itemID]);
						}
						catch (e){}
					}
				}
				
				// 1.0.0b2.r2
				
				if (i==10){
					var dates = Zotero.DB.query("SELECT itemID, value FROM itemData WHERE fieldID=14");
					for each(var row in dates){
						if (!Zotero.Date.isMultipart(row.value)){
							Zotero.DB.query("UPDATE itemData SET value=? WHERE itemID=? AND fieldID=14", [Zotero.Date.strToMultipart(row.value), row.itemID]);
						}
					}
				}
				
				if (i==11){
					var attachments = Zotero.DB.query("SELECT itemID, linkMode, path FROM itemAttachments WHERE linkMode IN (0,1)");
					for each(var row in attachments){
						var file = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
						try {
							file.persistentDescriptor = row.path;
							var storageDir = Zotero.getStorageDirectory();
							storageDir.QueryInterface(Components.interfaces.nsILocalFile);
							var path = file.getRelativeDescriptor(storageDir);
							Zotero.DB.query("UPDATE itemAttachments SET path=? WHERE itemID=?", [path, row.itemID]);
						}
						catch (e){}
					}
				}
				
				if (i==12){
					Zotero.DB.query("CREATE TABLE translatorsTemp (translatorID TEXT PRIMARY KEY, lastUpdated DATETIME, inRepository INT, priority INT, translatorType INT, label TEXT, creator TEXT, target TEXT, detectCode TEXT, code TEXT);");
					if (Zotero.DB.tableExists('translators')) {
						Zotero.DB.query("INSERT INTO translatorsTemp SELECT * FROM translators");
						Zotero.DB.query("DROP TABLE translators");
					}
					Zotero.DB.query("CREATE TABLE translators (\n    translatorID TEXT PRIMARY KEY,\n    minVersion TEXT,\n    maxVersion TEXT,\n    lastUpdated DATETIME,\n    inRepository INT,\n    priority INT,\n    translatorType INT,\n    label TEXT,\n    creator TEXT,\n    target TEXT,\n    detectCode TEXT,\n    code TEXT\n);");
					Zotero.DB.query("INSERT INTO translators SELECT translatorID, '', '', lastUpdated, inRepository, priority, translatorType, label, creator, target, detectCode, code FROM translatorsTemp");
					Zotero.DB.query("CREATE INDEX translators_type ON translators(translatorType)");
					Zotero.DB.query("DROP TABLE translatorsTemp");
				}
				
				if (i==13) {
					Zotero.DB.query("CREATE TABLE itemNotesTemp (itemID INT, sourceItemID INT, note TEXT, PRIMARY KEY (itemID), FOREIGN KEY (itemID) REFERENCES items(itemID), FOREIGN KEY (sourceItemID) REFERENCES items(itemID))");
					Zotero.DB.query("INSERT INTO itemNotesTemp SELECT * FROM itemNotes");
					Zotero.DB.query("DROP TABLE itemNotes");
					Zotero.DB.query("CREATE TABLE itemNotes (\n    itemID INT,\n    sourceItemID INT,\n    note TEXT,\n    isAbstract INT DEFAULT NULL,\n    PRIMARY KEY (itemID),\n    FOREIGN KEY (itemID) REFERENCES items(itemID),\n    FOREIGN KEY (sourceItemID) REFERENCES items(itemID)\n);");
					Zotero.DB.query("INSERT INTO itemNotes SELECT itemID, sourceItemID, note, NULL FROM itemNotesTemp");
					Zotero.DB.query("CREATE INDEX itemNotes_sourceItemID ON itemNotes(sourceItemID)");
					Zotero.DB.query("DROP TABLE itemNotesTemp");
				}
				
				// 1.0.0b3.r1
				
				// Repair for interrupted B4 upgrades
				if (i==14) {
					var hash = Zotero.DB.getColumnHash('itemNotes');
					if (!hash.isAbstract) {
						// See if itemDataValues exists
						if (!Zotero.DB.tableExists('itemDataValues')) {
							// Copied from step 23
							var notes = Zotero.DB.query("SELECT itemID, note FROM itemNotes WHERE itemID IN (SELECT itemID FROM items WHERE itemTypeID=1)");
							if (notes) {
								var f = function(text) { text = text + ''; var t = text.substring(0, 80); var ln = t.indexOf("\n"); if (ln>-1 && ln<80) { t = t.substring(0, ln); } return t; }
								for (var j=0; j<notes.length; j++) {
									Zotero.DB.query("REPLACE INTO itemNoteTitles VALUES (?,?)", [notes[j]['itemID'], f(notes[j]['note'])]);
								}
							}
							
							Zotero.DB.query("CREATE TABLE itemDataValues (\n    valueID INT,\n    value,\n    PRIMARY KEY (valueID)\n);");
							var values = Zotero.DB.columnQuery("SELECT DISTINCT value FROM itemData");
							if (values) {
								for (var j=0; j<values.length; j++) {
									var valueID = Zotero.ID.get('itemDataValues');
									Zotero.DB.query("INSERT INTO itemDataValues VALUES (?,?)", [valueID, values[j]]);
								}
							}
							
							Zotero.DB.query("CREATE TEMPORARY TABLE itemDataTemp AS SELECT itemID, fieldID, (SELECT valueID FROM itemDataValues WHERE value=ID.value) AS valueID FROM itemData ID");
							Zotero.DB.query("DROP TABLE itemData");
							Zotero.DB.query("CREATE TABLE itemData (\n    itemID INT,\n    fieldID INT,\n    valueID INT,\n    PRIMARY KEY (itemID, fieldID),\n    FOREIGN KEY (itemID) REFERENCES items(itemID),\n    FOREIGN KEY (fieldID) REFERENCES fields(fieldID)\n    FOREIGN KEY (valueID) REFERENCES itemDataValues(valueID)\n);");
							Zotero.DB.query("INSERT INTO itemData SELECT * FROM itemDataTemp");
							Zotero.DB.query("DROP TABLE itemDataTemp");
							
							i = 23;
							continue;
						}
						
						var rows = Zotero.DB.query("SELECT * FROM itemData WHERE valueID NOT IN (SELECT valueID FROM itemDataValues)");
						if (rows) {
							for (var j=0; j<rows.length; j++) {
								for (var j=0; j<values.length; j++) {
									var valueID = Zotero.ID.get('itemDataValues');
									Zotero.DB.query("INSERT INTO itemDataValues VALUES (?,?)", [valueID, values[j]]);
									Zotero.DB.query("UPDATE itemData SET valueID=? WHERE itemID=? AND fieldID=?", [valueID, rows[j]['itemID'], rows[j]['fieldID']]);
								}
							}
							i = 23;
							continue;
						}
						
						i = 27;
						continue;
					}
				}
				
				if (i==15) {
					Zotero.DB.query("DROP TABLE IF EXISTS annotations");
				}
				
				if (i==16) {
					Zotero.DB.query("CREATE TABLE tagsTemp (tagID INT, tag TEXT, PRIMARY KEY (tagID))");
					if (Zotero.DB.tableExists("tags")) {
						Zotero.DB.query("INSERT INTO tagsTemp SELECT * FROM tags");
						Zotero.DB.query("DROP TABLE tags");
					}
					Zotero.DB.query("CREATE TABLE tags (\n    tagID INT,\n    tag TEXT,\n    tagType INT,\n    PRIMARY KEY (tagID),\n    UNIQUE (tag, tagType)\n);");
					Zotero.DB.query("INSERT INTO tags SELECT tagID, tag, 0 FROM tagsTemp");
					Zotero.DB.query("DROP TABLE tagsTemp");
					
					// Compensate for csl table drop in step 8 for upgraders from early versions,
					// in case we do something with it in a later step
					Zotero.DB.query("CREATE TABLE IF NOT EXISTS csl (\n    cslID TEXT PRIMARY KEY,\n    updated DATETIME,\n    title TEXT,\n    csl TEXT\n);");
				}
				
				if (i==17) {
					Zotero.DB.query("UPDATE itemData SET fieldID=89 WHERE fieldID=8 AND itemID IN (SELECT itemID FROM items WHERE itemTypeID=7)");
				}
				
				if (i==19) {
					Zotero.DB.query("INSERT INTO itemData SELECT sourceItemID, 90, note FROM itemNotes WHERE isAbstract=1");
					Zotero.DB.query("DELETE FROM items WHERE itemID IN (SELECT itemID FROM itemNotes WHERE isAbstract=1)");
					Zotero.DB.query("DELETE FROM itemData WHERE itemID IN (SELECT itemID FROM itemNotes WHERE isAbstract=1)");
					Zotero.DB.query("CREATE TEMPORARY TABLE itemNotesTemp (itemID INT, sourceItemID INT, note TEXT)");
					Zotero.DB.query("INSERT INTO itemNotesTemp SELECT itemID, sourceItemID, note FROM itemNotes WHERE isAbstract IS NULL");
					Zotero.DB.query("DROP TABLE itemNotes");
					Zotero.DB.query("CREATE TABLE itemNotes (\n    itemID INT,\n    sourceItemID INT,\n    note TEXT,    \n    PRIMARY KEY (itemID),\n    FOREIGN KEY (itemID) REFERENCES items(itemID),\n    FOREIGN KEY (sourceItemID) REFERENCES items(itemID)\n);");
					Zotero.DB.query("INSERT INTO itemNotes SELECT * FROM itemNotesTemp")
					Zotero.DB.query("DROP TABLE itemNotesTemp");
				}
				
				if (i==20) {
					Zotero.DB.query("UPDATE itemData SET fieldID=91 WHERE itemID IN (SELECT itemID FROM items WHERE itemTypeID=13) AND fieldID=12;");
					Zotero.DB.query("UPDATE itemData SET fieldID=92 WHERE itemID IN (SELECT itemID FROM items WHERE itemTypeID=15) AND fieldID=60;");
					Zotero.DB.query("UPDATE itemData SET fieldID=93 WHERE itemID IN (SELECT itemID FROM items WHERE itemTypeID=16) AND fieldID=60;");
					Zotero.DB.query("UPDATE itemData SET fieldID=94 WHERE itemID IN (SELECT itemID FROM items WHERE itemTypeID=16) AND fieldID=4;");
					Zotero.DB.query("UPDATE itemData SET fieldID=95 WHERE itemID IN (SELECT itemID FROM items WHERE itemTypeID=16) AND fieldID=10;");
					Zotero.DB.query("UPDATE itemData SET fieldID=96 WHERE itemID IN (SELECT itemID FROM items WHERE itemTypeID=17) AND fieldID=14;");
					Zotero.DB.query("UPDATE itemData SET fieldID=97 WHERE itemID IN (SELECT itemID FROM items WHERE itemTypeID=17) AND fieldID=4;");
					Zotero.DB.query("UPDATE itemData SET fieldID=98 WHERE itemID IN (SELECT itemID FROM items WHERE itemTypeID=17) AND fieldID=10;");
					Zotero.DB.query("UPDATE itemData SET fieldID=99 WHERE itemID IN (SELECT itemID FROM items WHERE itemTypeID=18) AND fieldID=60;");
					Zotero.DB.query("UPDATE itemData SET fieldID=100 WHERE itemID IN (SELECT itemID FROM items WHERE itemTypeID=20) AND fieldID=14;");
					Zotero.DB.query("UPDATE itemData SET fieldID=101 WHERE itemID IN (SELECT itemID FROM items WHERE itemTypeID=20) AND fieldID=60;");
					Zotero.DB.query("UPDATE itemData SET fieldID=102 WHERE itemID IN (SELECT itemID FROM items WHERE itemTypeID=19) AND fieldID=7;");
					Zotero.DB.query("UPDATE itemData SET fieldID=103 WHERE itemID IN (SELECT itemID FROM items WHERE itemTypeID=19) AND fieldID=60;");
					Zotero.DB.query("UPDATE itemData SET fieldID=104 WHERE itemID IN (SELECT itemID FROM items WHERE itemTypeID=25) AND fieldID=12;");
					Zotero.DB.query("UPDATE itemData SET fieldID=105 WHERE itemID IN (SELECT itemID FROM items WHERE itemTypeID=29) AND fieldID=60;");
					Zotero.DB.query("UPDATE itemData SET fieldID=105 WHERE itemID IN (SELECT itemID FROM items WHERE itemTypeID=30) AND fieldID=60;");
					Zotero.DB.query("UPDATE itemData SET fieldID=105 WHERE itemID IN (SELECT itemID FROM items WHERE itemTypeID=31) AND fieldID=60;");
					Zotero.DB.query("UPDATE itemData SET fieldID=107 WHERE itemID IN (SELECT itemID FROM items WHERE itemTypeID=23) AND fieldID=12;");
					Zotero.DB.query("INSERT OR IGNORE INTO itemData SELECT itemID, 52, value FROM itemData WHERE fieldID IN (14, 52) AND itemID IN (SELECT itemID FROM items WHERE itemTypeID=19) LIMIT 1");
					Zotero.DB.query("DELETE FROM itemData WHERE itemID IN (SELECT itemID FROM items WHERE itemTypeID=19) AND fieldID=14");
				}
				
				if (i==21) {
					Zotero.DB.query("INSERT INTO itemData SELECT itemID, 110, title FROM items WHERE title IS NOT NULL AND itemTypeID NOT IN (1,17,20,21)");
					Zotero.DB.query("INSERT INTO itemData SELECT itemID, 111, title FROM items WHERE title IS NOT NULL AND itemTypeID = 17");
					Zotero.DB.query("INSERT INTO itemData SELECT itemID, 112, title FROM items WHERE title IS NOT NULL AND itemTypeID = 20");
					Zotero.DB.query("INSERT INTO itemData SELECT itemID, 113, title FROM items WHERE title IS NOT NULL AND itemTypeID = 21");
					Zotero.DB.query("CREATE TEMPORARY TABLE itemsTemp AS SELECT itemID, itemTypeID, dateAdded, dateModified FROM items");
					Zotero.DB.query("DROP TABLE items");
					Zotero.DB.query("CREATE TABLE IF NOT EXISTS items (\n    itemID INTEGER PRIMARY KEY,\n    itemTypeID INT,\n    dateAdded DATETIME DEFAULT CURRENT_TIMESTAMP,\n    dateModified DATETIME DEFAULT CURRENT_TIMESTAMP\n);");
					Zotero.DB.query("INSERT INTO items SELECT * FROM itemsTemp");
					Zotero.DB.query("DROP TABLE itemsTemp");
				}
				
				if (i==22) {
					if (Zotero.DB.valueQuery("SELECT COUNT(*) FROM items WHERE itemID=0")) {
						var itemID = Zotero.ID.get('items', true);
						Zotero.DB.query("UPDATE items SET itemID=? WHERE itemID=?", [itemID, 0]);
						Zotero.DB.query("UPDATE itemData SET itemID=? WHERE itemID=?", [itemID, 0]);
						Zotero.DB.query("UPDATE itemNotes SET itemID=? WHERE itemID=?", [itemID, 0]);
						Zotero.DB.query("UPDATE itemAttachments SET itemID=? WHERE itemID=?", [itemID, 0]);
					}
					if (Zotero.DB.valueQuery("SELECT COUNT(*) FROM collections WHERE collectionID=0")) {
						var collectionID = Zotero.ID.get('collections', true);
						Zotero.DB.query("UPDATE collections SET collectionID=? WHERE collectionID=0", [collectionID]);
						Zotero.DB.query("UPDATE collectionItems SET collectionID=? WHERE collectionID=0", [collectionID]);
					}
					Zotero.DB.query("DELETE FROM tags WHERE tagID=0");
					Zotero.DB.query("DELETE FROM itemTags WHERE tagID=0");
					Zotero.DB.query("DELETE FROM savedSearches WHERE savedSearchID=0");
				}
				
				if (i==23) {
					Zotero.DB.query("CREATE TABLE IF NOT EXISTS itemNoteTitles (\n    itemID INT,\n    title TEXT,\n    PRIMARY KEY (itemID),\n    FOREIGN KEY (itemID) REFERENCES itemNotes(itemID)\n);");
					var notes = Zotero.DB.query("SELECT itemID, note FROM itemNotes WHERE itemID IN (SELECT itemID FROM items WHERE itemTypeID=1)");
					if (notes) {
					var f = function(text) { var t = text.substring(0, 80); var ln = t.indexOf("\n"); if (ln>-1 && ln<80) { t = t.substring(0, ln); } return t; }
						for (var j=0; j<notes.length; j++) {
							Zotero.DB.query("INSERT INTO itemNoteTitles VALUES (?,?)", [notes[j]['itemID'], f(notes[j]['note'])]);
						}
					}
					
					Zotero.DB.query("CREATE TABLE IF NOT EXISTS itemDataValues (\n    valueID INT,\n    value,\n    PRIMARY KEY (valueID)\n);");
					var values = Zotero.DB.columnQuery("SELECT DISTINCT value FROM itemData");
					if (values) {
						for (var j=0; j<values.length; j++) {
							var valueID = Zotero.ID.get('itemDataValues');
							Zotero.DB.query("INSERT INTO itemDataValues VALUES (?,?)", [valueID, values[j]]);
						}
					}
					
					Zotero.DB.query("CREATE TEMPORARY TABLE itemDataTemp AS SELECT itemID, fieldID, (SELECT valueID FROM itemDataValues WHERE value=ID.value) AS valueID FROM itemData ID");
					Zotero.DB.query("DROP TABLE itemData");
					Zotero.DB.query("CREATE TABLE itemData (\n    itemID INT,\n    fieldID INT,\n    valueID INT,\n    PRIMARY KEY (itemID, fieldID),\n    FOREIGN KEY (itemID) REFERENCES items(itemID),\n    FOREIGN KEY (fieldID) REFERENCES fields(fieldID)\n    FOREIGN KEY (valueID) REFERENCES itemDataValues(valueID)\n);");
					Zotero.DB.query("INSERT INTO itemData SELECT * FROM itemDataTemp");
					Zotero.DB.query("DROP TABLE itemDataTemp");
				}
				
				if (i==24) {
					var rows = Zotero.DB.query("SELECT * FROM itemData NATURAL JOIN itemDataValues WHERE fieldID IN (52,96,100)");
					if (rows) {
						for (var j=0; j<rows.length; j++) {
							if (!Zotero.Date.isMultipart(rows[j]['value'])) {
								var value = Zotero.Date.strToMultipart(rows[j]['value']);
								var valueID = Zotero.DB.valueQuery("SELECT valueID FROM itemDataValues WHERE value=?", rows[j]['value']);
								if (!valueID) {
									var valueID = Zotero.ID.get('itemDataValues');
									Zotero.DB.query("INSERT INTO itemDataValues VALUES (?,?)", [valueID, value]);
								}
								Zotero.DB.query("UPDATE itemData SET valueID=? WHERE itemID=? AND fieldID=?", [valueID, rows[j]['itemID'], rows[j]['fieldID']]);
							}
						}
					}
				}
				
				if (i==25) {
					Zotero.DB.query("UPDATE itemData SET fieldID=100 WHERE itemID IN (SELECT itemID FROM items WHERE itemTypeID=15) AND fieldID=14;")
				}
				
				if (i==26) {
					Zotero.DB.query("INSERT INTO itemData SELECT itemID, 114, valueID FROM itemData WHERE itemID IN (SELECT itemID FROM items WHERE itemTypeID=33) AND fieldID=84");
				}
				
				if (i==27) {
					Zotero.DB.query("UPDATE itemData SET fieldID=115 WHERE itemID IN (SELECT itemID FROM items WHERE itemTypeID=3) AND fieldID=12");
				}
				
				// 1.0.0b4.r1
				
				if (i==28) {
					var childNotes = Zotero.DB.query("SELECT * FROM itemNotes WHERE itemID IN (SELECT itemID FROM items) AND sourceItemID IS NOT NULL");
					if (!childNotes.length) {
						continue;
					}
					Zotero.DB.query("CREATE TEMPORARY TABLE itemNotesTemp AS SELECT * FROM itemNotes WHERE note IN (SELECT itemID FROM items) AND sourceItemID IS NOT NULL");
					Zotero.DB.query("CREATE INDEX tmp_itemNotes_pk ON itemNotesTemp(note, sourceItemID);");
					var num = Zotero.DB.valueQuery("SELECT COUNT(*) FROM itemNotesTemp");
					if (!num) {
						continue;
					}
					for (var j=0; j<childNotes.length; j++) {
						var reversed = Zotero.DB.query("SELECT * FROM itemNotesTemp WHERE note=? AND sourceItemID=?", [childNotes[j].itemID, childNotes[j].sourceItemID]);
						if (!reversed.length) {
							continue;
						}
						var maxLength = 0;
						for (var k=0; k<reversed.length; k++) {
							if (reversed[k].itemID.length > maxLength) {
								maxLength = reversed[k].itemID.length;
								var maxLengthIndex = k;
							}
						}
						if (maxLengthIndex) {
							Zotero.DB.query("UPDATE itemNotes SET note=? WHERE itemID=?", [reversed[maxLengthIndex].itemID, childNotes[j].itemID]);
							var f = function(text) { text = text + ''; var t = text.substring(0, 80); var ln = t.indexOf("\n"); if (ln>-1 && ln<80) { t = t.substring(0, ln); } return t; }
							Zotero.DB.query("UPDATE itemNoteTitles SET title=? WHERE itemID=?", [f(reversed[maxLengthIndex].itemID), childNotes[j].itemID]);
						}
						Zotero.DB.query("DELETE FROM itemNotes WHERE note=? AND sourceItemID=?", [childNotes[j].itemID, childNotes[j].sourceItemID]);
					}
				}
				
				// 1.0.0b4.r2
				
				if (i==29) {
					Zotero.DB.query("CREATE TABLE IF NOT EXISTS settings (\n    setting TEXT,\n    key TEXT,\n    value,\n    PRIMARY KEY (setting, key)\n);");
				}
				
				if (i==31) {
					Zotero.DB.query("UPDATE itemData SET fieldID=14 WHERE itemID IN (SELECT itemID FROM items WHERE itemTypeID=15) AND fieldID=100");
				}
				
				if (i==32) {
					Zotero.DB.query("UPDATE itemData SET fieldID=100 WHERE itemID IN (SELECT itemID FROM items WHERE itemTypeID=20) AND fieldID=14;");
				}
				
				// 1.0.0b4.r3
				
				if (i==33) {
					var rows = Zotero.DB.query("SELECT * FROM itemNotes WHERE itemID NOT IN (SELECT itemID FROM items)");
					if (rows) {
						var colID = Zotero.ID.get('collections');
						Zotero.DB.query("INSERT INTO collections VALUES (?,?,?)", [colID, "[Recovered Notes]", null]);
						
						for (var j=0; j<rows.length; j++) {
							if (rows[j].sourceItemID) {
								var count = Zotero.DB.valueQuery("SELECT COUNT(*) FROM items WHERE itemID=?", rows[j].sourceItemID);
								if (count == 0) {
									Zotero.DB.query("UPDATE itemNotes SET sourceItemID=NULL WHERE itemID=?", rows[j].sourceItemID);
								}
							}
							var parsedID = parseInt(rows[j].itemID);
							if ((parsedID + '').length != rows[j].itemID) {
								if (parseInt(rows[j].note) != rows[j].note ||
										(parseInt(rows[j].note) + '').length != rows[j].note.length) {
									Zotero.DB.query("DELETE FROM itemNotes WHERE itemID=?", rows[j].itemID);
									continue;
								}
								var exists = Zotero.DB.valueQuery("SELECT COUNT(*) FROM itemNotes WHERE itemID=?", rows[j].note);
								if (exists) {
									var noteItemID = Zotero.ID.get('items', true);
								}
								else {
									var noteItemID = rows[j].note;
								}
								Zotero.DB.query("UPDATE itemNotes SET itemID=?, sourceItemID=NULL, note=? WHERE itemID=? AND sourceItemID=?", [noteItemID, rows[j].itemID, rows[j].itemID, rows[j].sourceItemID]);
								var f = function(text) { text = text + ''; var t = text.substring(0, 80); var ln = t.indexOf("\n"); if (ln>-1 && ln<80) { t = t.substring(0, ln); } return t; }
								Zotero.DB.query("REPLACE INTO itemNoteTitles VALUES (?,?)", [noteItemID, f(rows[j].itemID)]);
								Zotero.DB.query("INSERT OR IGNORE INTO items (itemID, itemTypeID) VALUES (?,?)", [noteItemID, 1]);
								var max = Zotero.DB.valueQuery("SELECT COUNT(*) FROM collectionItems WHERE collectionID=?", colID);
								Zotero.DB.query("INSERT OR IGNORE INTO collectionItems VALUES (?,?,?)", [colID, noteItemID, max]);
								continue;
							}
							else if (parsedID != rows[j].itemID) {
								Zotero.DB.query("DELETE FROM itemNotes WHERE itemID=?", rows[j].itemID);
								continue;
							}
							Zotero.DB.query("INSERT INTO items (itemID, itemTypeID) VALUES (?,?)", [rows[j].itemID, 1]);
							var max = Zotero.DB.valueQuery("SELECT COUNT(*) FROM collectionItems WHERE collectionID=?", colID);
							Zotero.DB.query("INSERT INTO collectionItems VALUES (?,?,?)", [colID, rows[j].itemID, max]);
						}
					}
				}
				
				// 1.0.0b4.r5
				
				if (i==34) {
					if (!Zotero.DB.tableExists('annotations')) {
						Zotero.DB.query("CREATE TABLE annotations (\n    annotationID INTEGER PRIMARY KEY,\n    itemID INT,\n    parent TEXT,\n    textNode INT,\n    offset INT,\n    x INT,\n    y INT,\n    cols INT,\n    rows INT,\n    text TEXT,\n    collapsed BOOL,\n    dateModified DATE,\n    FOREIGN KEY (itemID) REFERENCES itemAttachments(itemID)\n)");
						Zotero.DB.query("CREATE INDEX annotations_itemID ON annotations(itemID)");
					}
					else {
						Zotero.DB.query("ALTER TABLE annotations ADD collapsed BOOL");
						Zotero.DB.query("ALTER TABLE annotations ADD dateModified DATETIME");
					}
					if (!Zotero.DB.tableExists('highlights')) {
						Zotero.DB.query("CREATE TABLE highlights (\n    highlightID INTEGER PRIMARY KEY,\n    itemID INTEGER,\n    startParent TEXT,\n    startTextNode INT,\n    startOffset INT,\n    endParent TEXT,\n    endTextNode INT,\n    endOffset INT,\n    dateModified DATE,\n    FOREIGN KEY (itemID) REFERENCES itemAttachments(itemID)\n)");
						Zotero.DB.query("CREATE INDEX highlights_itemID ON highlights(itemID)");
					}
					else {
						Zotero.DB.query("ALTER TABLE highlights ADD dateModified DATETIME");
					}
					Zotero.DB.query("UPDATE annotations SET dateModified = DATETIME('now')");
					Zotero.DB.query("UPDATE highlights SET dateModified = DATETIME('now')");
				}
				
				if (i==35) {
					Zotero.DB.query("ALTER TABLE fulltextItems RENAME TO fulltextItemWords");
					Zotero.DB.query("CREATE TABLE fulltextItems (\n    itemID INT,\n    version INT,\n    PRIMARY KEY (itemID),\n    FOREIGN KEY (itemID) REFERENCES items(itemID)\n);");
				}
				
				if (i==36) {
					Zotero.DB.query("ALTER TABLE fulltextItems ADD indexedPages INT");
					Zotero.DB.query("ALTER TABLE fulltextItems ADD totalPages INT");
					Zotero.DB.query("ALTER TABLE fulltextItems ADD indexedChars INT");
					Zotero.DB.query("ALTER TABLE fulltextItems ADD totalChars INT");
					Zotero.DB.query("DELETE FROM version WHERE schema='fulltext'");
				}
				
				// 1.5 Sync Preview 1
				if (i==37) {
					// Some data cleanup from the pre-FK-trigger days
					Zotero.DB.query("DELETE FROM annotations WHERE itemID NOT IN (SELECT itemID FROM items)");
					Zotero.DB.query("DELETE FROM collectionItems WHERE itemID NOT IN (SELECT itemID FROM items)");
					Zotero.DB.query("DELETE FROM fulltextItems WHERE itemID NOT IN (SELECT itemID FROM items)");
					Zotero.DB.query("DELETE FROM fulltextItemWords WHERE itemID NOT IN (SELECT itemID FROM items)");
					Zotero.DB.query("DELETE FROM highlights WHERE itemID NOT IN (SELECT itemID FROM items)");
					Zotero.DB.query("DELETE FROM itemAttachments WHERE itemID NOT IN (SELECT itemID FROM items)");
					Zotero.DB.query("DELETE FROM itemCreators WHERE itemID NOT IN (SELECT itemID FROM items)");
					Zotero.DB.query("DELETE FROM itemData WHERE itemID NOT IN (SELECT itemID FROM items)");
					Zotero.DB.query("DELETE FROM itemNotes WHERE itemID NOT IN (SELECT itemID FROM items)");
					Zotero.DB.query("DELETE FROM itemNoteTitles WHERE itemID NOT IN (SELECT itemID FROM itemNotes)");
					Zotero.DB.query("DELETE FROM itemSeeAlso WHERE itemID NOT IN (SELECT itemID FROM items)");
					Zotero.DB.query("DELETE FROM itemSeeAlso WHERE linkedItemID NOT IN (SELECT itemID FROM items)");
					Zotero.DB.query("DELETE FROM itemTags WHERE itemID NOT IN (SELECT itemID FROM items)");
					Zotero.DB.query("DELETE FROM itemTags WHERE tagID NOT IN (SELECT tagID FROM tags)");
					Zotero.DB.query("DELETE FROM savedSearchConditions WHERE savedSearchID NOT IN (select savedSearchID FROM savedSearches)");
					
					Zotero.DB.query("DELETE FROM itemData WHERE valueID NOT IN (SELECT valueID FROM itemDataValues)");
					Zotero.DB.query("DELETE FROM fulltextItemWords WHERE wordID NOT IN (SELECT wordID FROM fulltextWords)");
					Zotero.DB.query("DELETE FROM collectionItems WHERE collectionID NOT IN (SELECT collectionID FROM collections)");
					Zotero.DB.query("DELETE FROM itemCreators WHERE creatorID NOT IN (SELECT creatorID FROM creators)");
					Zotero.DB.query("DELETE FROM itemTags WHERE tagID NOT IN (SELECT tagID FROM tags)");
					Zotero.DB.query("DELETE FROM itemData WHERE fieldID NOT IN (SELECT fieldID FROM fields)");
					Zotero.DB.query("DELETE FROM itemData WHERE valueID NOT IN (SELECT valueID FROM itemDataValues)");
					
					Zotero.DB.query("DROP TABLE IF EXISTS userFieldMask");
					Zotero.DB.query("DROP TABLE IF EXISTS userItemTypes");
					Zotero.DB.query("DROP TABLE IF EXISTS userItemTypeMask");
					Zotero.DB.query("DROP TABLE IF EXISTS userFields");
					Zotero.DB.query("DROP TABLE IF EXISTS userItemTypeFields");
					
					// Index corruption can allow duplicate values
					var wordIDs = Zotero.DB.columnQuery("SELECT GROUP_CONCAT(wordID) AS wordIDs FROM fulltextWords GROUP BY word HAVING COUNT(*)>1");
					if (wordIDs.length) {
						Zotero.DB.query("CREATE TEMPORARY TABLE deleteWordIDs (wordID INTEGER PRIMARY KEY)");
						for (var j=0, len=wordIDs.length; j<len; j++) {
							var ids = wordIDs[j].split(',');
							for (var k=1; k<ids.length; k++) {
								Zotero.DB.query("INSERT INTO deleteWordIDs VALUES (?)", ids[k]);
							}
						}
						Zotero.DB.query("DELETE FROM fulltextWords WHERE wordID IN (SELECT wordID FROM deleteWordIDs)");
						Zotero.DB.query("DROP TABLE deleteWordIDs");
					}
					
					Zotero.DB.query("DROP INDEX IF EXISTS fulltextWords_word");
					
					Zotero.DB.query("REINDEX");
					Zotero.DB.transactionVacuum = true;
					
					// Set page cache size to 8MB
					var pageSize = Zotero.DB.valueQuery("PRAGMA page_size");
					var cacheSize = 8192000 / pageSize;
					Zotero.DB.query("PRAGMA default_cache_size=" + cacheSize);
					
					// Orphaned child attachment
					Zotero.DB.query("UPDATE itemAttachments SET sourceItemID=NULL WHERE sourceItemID NOT IN (SELECT itemID FROM items)");
					Zotero.DB.query("UPDATE itemNotes SET sourceItemID=NULL WHERE sourceItemID NOT IN (SELECT itemID FROM items)");
					
					// Create sync delete log
					Zotero.DB.query("CREATE TABLE syncDeleteLog (\n    syncObjectTypeID INT NOT NULL,\n    objectID INT NOT NULL,\n    key TEXT NOT NULL,\n    timestamp INT NOT NULL,\n    FOREIGN KEY (syncObjectTypeID) REFERENCES syncObjectTypes(syncObjectTypeID)\n);");
					Zotero.DB.query("CREATE INDEX syncDeleteLog_timestamp ON syncDeleteLog(timestamp);");
					
					// Note titles
					Zotero.DB.query("ALTER TABLE itemNotes ADD COLUMN title TEXT");
					var notes = Zotero.DB.query("SELECT itemID, title FROM itemNoteTitles");
					if (notes) {
						var statement = Zotero.DB.getStatement("UPDATE itemNotes SET title=? WHERE itemID=?");
						for (var j=0, len=notes.length; j<len; j++) {
							statement.bindUTF8StringParameter(0, notes[j].title);
							statement.bindInt32Parameter(1, notes[j].itemID);
							try {
								statement.execute();
							}
							catch (e) {
								throw (Zotero.DB.getLastErrorString());
							}
						}
						statement.reset();
					}
					Zotero.DB.query("DROP TABLE itemNoteTitles");
					
					// Creator data
					Zotero.DB.query("CREATE TABLE creatorData (\n    creatorDataID INTEGER PRIMARY KEY,\n    firstName TEXT,\n    lastName TEXT,\n    shortName TEXT,\n    fieldMode INT,\n    birthYear INT\n)");
					Zotero.DB.query("INSERT INTO creatorData SELECT DISTINCT NULL, firstName, lastName, NULL, fieldMode, NULL FROM creators WHERE creatorID IN (SELECT creatorID FROM itemCreators)");
					Zotero.DB.query("CREATE TEMPORARY TABLE itemCreatorsTemp AS SELECT * FROM itemCreators NATURAL JOIN creators");
					Zotero.DB.query("DROP TABLE creators");
					Zotero.DB.query("CREATE TABLE creators (\n    creatorID INTEGER PRIMARY KEY,\n    creatorDataID INT,\n    dateModified DEFAULT CURRENT_TIMESTAMP NOT NULL,\n    key TEXT NOT NULL,\n    FOREIGN KEY (creatorDataID) REFERENCES creatorData(creatorDataID)\n);");
					
					var data = Zotero.DB.query("SELECT * FROM creatorData");
					if (data) {
						Zotero.DB.query("CREATE INDEX itemCreatorsTemp_names ON itemCreatorsTemp(lastName, firstName)");
						Zotero.DB.query("DELETE FROM itemCreators");

						// For each distinct data row, create a new creator
						var insertStatement = Zotero.DB.getStatement("INSERT INTO creators (creatorID, creatorDataID, key) VALUES (?, ?, ?)");
						for (var j=0, len=data.length; j<len; j++) {
							insertStatement.bindInt32Parameter(0, data[j].creatorDataID);
							insertStatement.bindInt32Parameter(1, data[j].creatorDataID);
							var key = Zotero.ID.getKey();
							insertStatement.bindStringParameter(2, key);
							try {
								insertStatement.execute();
							}
							catch (e) {
								throw (Zotero.DB.getLastErrorString());
							}
						}
						insertStatement.reset();
						
						Zotero.DB.query("INSERT INTO itemCreators SELECT itemID, C.creatorID, creatorTypeID, orderIndex FROM itemCreatorsTemp ICT JOIN creatorData CD ON (ICT.firstName=CD.firstName AND ICT.lastName=CD.lastName AND ICT.fieldMode=CD.fieldMode) JOIN creators C ON (CD.creatorDataID=C.creatorDataID)");
					}
					Zotero.DB.query("DROP TABLE itemCreatorsTemp");
					Zotero.DB.query("CREATE INDEX creators_creatorDataID ON creators(creatorDataID)");
					
					// Items
					Zotero.DB.query("ALTER TABLE items ADD COLUMN key TEXT");
					
					var items = Zotero.DB.query("SELECT itemID, itemTypeID, dateAdded FROM items");
					var titles = Zotero.DB.query("SELECT itemID, value FROM itemData NATURAL JOIN itemDataValues WHERE fieldID BETWEEN 110 AND 112");
					var statement = Zotero.DB.getStatement("UPDATE items SET key=? WHERE itemID=?");
					for (var j=0, len=items.length; j<len; j++) {
						var key = Zotero.ID.getKey();
						if (key == 'AJ4PT6IT') {
							j--;
							continue;
						}
						else if (items[j].itemID == 123456789) {
							key = 'AJ4PT6IT';
						}
						statement.bindStringParameter(0, key);
						statement.bindInt32Parameter(1, items[j].itemID);
						try {
							statement.execute();
						}
						catch (e) {
							throw (Zotero.DB.getLastErrorString());
						}
					}
					statement.reset();
					Zotero.DB.query("CREATE UNIQUE INDEX items_key ON items(key)");
					
					var rows = Zotero.DB.columnQuery("SELECT GROUP_CONCAT(valueID) FROM itemDataValues GROUP BY value HAVING COUNT(*) > 1");
					for each(var row in rows) {
						var ids = row.split(',');
						var deleteIDs = [];
						for (var j=1; j<ids.length; j++) {
							deleteIDs.push(parseInt(ids[j]));
						}
						Zotero.DB.query("UPDATE itemData SET valueID=? WHERE valueID IN (" + deleteIDs.map(function () '?').join() + ")", [parseInt(ids[0])].concat(deleteIDs));
						Zotero.DB.query("DELETE FROM itemDataValues WHERE valueID IN (" + deleteIDs.map(function () '?').join() + ")", deleteIDs);
					}
					Zotero.DB.query("CREATE UNIQUE INDEX itemDataValues_value ON itemDataValues(value)");
					
					// Collections
					var collections = Zotero.DB.query("SELECT * FROM collections");
					Zotero.DB.query("DROP TABLE collections");
					Zotero.DB.query("CREATE TABLE collections (\n    collectionID INTEGER PRIMARY KEY,\n    collectionName TEXT,\n    parentCollectionID INT,\n    dateModified DEFAULT CURRENT_TIMESTAMP NOT NULL,\n    key TEXT NOT NULL UNIQUE,\n    FOREIGN KEY (parentCollectionID) REFERENCES collections(collectionID)\n);");
					var statement = Zotero.DB.getStatement("INSERT INTO collections (collectionID, collectionName, parentCollectionID, key) VALUES (?,?,?,?)");
					for (var j=0, len=collections.length; j<len; j++) {
						statement.bindInt32Parameter(0, collections[j].collectionID);
						statement.bindUTF8StringParameter(1, collections[j].collectionName);
						if (collections[j].parentCollectionID) {
							statement.bindInt32Parameter(2, collections[j].parentCollectionID);
						}
						else {
							statement.bindNullParameter(2);
						}
						var key = Zotero.ID.getKey();
						statement.bindStringParameter(3, key);
						
						try {
							statement.execute();
						}
						catch (e) {
							throw (Zotero.DB.getLastErrorString());
						}
					}
					statement.reset();
					
					// Saved searches
					var searches = Zotero.DB.query("SELECT * FROM savedSearches");
					Zotero.DB.query("DROP TABLE savedSearches");
					Zotero.DB.query("CREATE TABLE savedSearches (\n    savedSearchID INTEGER PRIMARY KEY,\n    savedSearchName TEXT,\n    dateModified DEFAULT CURRENT_TIMESTAMP NOT NULL,\n    key TEXT NOT NULL UNIQUE\n);");
					var statement = Zotero.DB.getStatement("INSERT INTO savedSearches (savedSearchID, savedSearchName, key) VALUES (?,?,?)");
					for (var j=0, len=searches.length; j<len; j++) {
						statement.bindInt32Parameter(0, searches[j].savedSearchID);
						statement.bindUTF8StringParameter(1, searches[j].savedSearchName);
						var key = Zotero.ID.getKey();
						statement.bindStringParameter(2, key);

						try {
							statement.execute();
						}
						catch (e) {
							throw (Zotero.DB.getLastErrorString());
						}
					}
					statement.reset();
					
					// Tags
					var tags = Zotero.DB.query("SELECT tagID, tag AS tag, tagType FROM tags");
					var newTags = [];
					var cases = {};
					if (tags) {
						// Find tags with multiple case forms
						for each(var row in tags) {
							var l = '_' + row.tag.toLowerCase();
							if (!cases[l]) {
								cases[l] = [];
							}
							if (cases[l].indexOf(row.tag) == -1) {
								cases[l].push(row.tag);
							}
						}
						var done = {};
						for each(var row in tags) {
							var l = row.tag.toLowerCase();
							var lk = '_' + l;
							
							if (done[lk]) {
								continue;
							}
							done[lk] = true;
							
							// Only one tag -- use
							if (cases[lk].length == 1) {
								newTags.push(row);
								continue;
							}
							
							var counts = Zotero.DB.query("SELECT tag, COUNT(*) AS numItems FROM tags NATURAL JOIN itemTags WHERE tag LIKE ? GROUP BY tag ORDER BY numItems DESC", l);
							// If not associated with any items, use all lowercase
							if (!counts) {
								var newTag = l;
							}
							// Use most frequent
							else if (counts[0].numItems != counts[1].numItems) {
								var newTag = counts[0].tag;
							}
							// Use earliest
							else {
								var newTag = Zotero.DB.valueQuery("SELECT tag FROM tags NATURAL JOIN itemTags WHERE tag IN (SELECT tag FROM tags NATURAL JOIN itemTags NATURAL JOIN items WHERE tag LIKE ? ORDER BY dateAdded LIMIT 1) GROUP BY tag", l);
							}
							
							// Point old to new
							var types = Zotero.DB.columnQuery("SELECT DISTINCT tagType FROM tags WHERE tag LIKE ?", l);
							for each(var type in types) {
								var newTagID = Zotero.DB.valueQuery("SELECT tagID FROM tags WHERE tag=? AND tagType=?", [newTag, type]);
								var oldIDs = Zotero.DB.columnQuery("SELECT tagID FROM tags WHERE tag LIKE ? AND tag != ? AND tagType=?", [l, newTag, type]);
								if (oldIDs) {
									if (!newTagID) {
										newTagID = oldIDs[0];
									}
									Zotero.DB.query("UPDATE OR REPLACE itemTags SET tagID=? WHERE tagID IN (" + oldIDs.map(function () '?').join() + ")", [newTagID].concat(oldIDs));
								}
								newTags.push({ tagID: newTagID, tag: newTag, tagType: type });
							}
						}
					}
					
					Zotero.DB.query("DROP TABLE tags");
					Zotero.DB.query("CREATE TABLE tags (\n    tagID INTEGER PRIMARY KEY,\n    name TEXT COLLATE NOCASE,\n    type INT,\n    dateModified DEFAULT CURRENT_TIMESTAMP NOT NULL,\n    key TEXT NOT NULL UNIQUE,\n    UNIQUE (name, type)\n)");
					var statement = Zotero.DB.getStatement("INSERT INTO tags (tagID, name, type, key) VALUES (?,?,?,?)");
					for (var j=0, len=newTags.length; j<len; j++) {
						statement.bindInt32Parameter(0, newTags[j].tagID);
						statement.bindUTF8StringParameter(1, newTags[j].tag);
						statement.bindInt32Parameter(2, newTags[j].tagType);
						var key = Zotero.ID.getKey();
						statement.bindStringParameter(3, key);

						try {
							statement.execute();
						}
						catch (e) {
							throw (Zotero.DB.getLastErrorString());
						}
					}
					statement.reset();
					
					// Migrate attachment folders to secondary keys
					Zotero.DB.query("UPDATE itemAttachments SET path=REPLACE(path, itemID || '/', 'storage:') WHERE path REGEXP '^[0-9]+/'");
					
					if (Zotero.Prefs.get('useDataDir')) {
						var dataDir = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
						dataDir.persistentDescriptor = Zotero.Prefs.get('dataDir');
					}
					else {
						var dataDir = Zotero.getProfileDirectory();
						dataDir.append('zotero');
					}
					if (!dataDir.exists() || !dataDir.isDirectory()){
						var e = { name: "NS_ERROR_FILE_NOT_FOUND" };
						throw (e);
					}
					var movedFiles37 = {};
					var moveReport = '';
					var orphaned = dataDir.clone();
					var storage37 = dataDir.clone();
					var moveReportFile = dataDir.clone();
					orphaned.append('orphaned-files');
					storage37.append('storage');
					moveReportFile.append('zotero.moved-files.' + fromVersion + '.bak');
					var keys = {};
					var rows = Zotero.DB.query("SELECT itemID, key FROM items");
					for each(var row in rows) {
						keys[row.itemID] = row.key;
					}
					if (storage37.exists()) {
						var entries = storage37.directoryEntries;
						entries.QueryInterface(Components.interfaces.nsIDirectoryEnumerator);
						var file;
						var renameQueue = [];
						var orphanQueue = [];
						while (file = entries.nextFile) {
							var id = parseInt(file.leafName);
							if (!file.isDirectory() || file.leafName != id) {
								continue;
							}
							if (keys[id]) {
								var renameTarget = storage37.clone();
								renameTarget.append(keys[id]);
								if (renameTarget.exists()) {
									orphanQueue.push({
										id: id,
										file: renameTarget
									});
								}
								renameQueue.push({
									id: id,
									file: file,
									key: keys[id]
								});
							}
							else {
								orphanQueue.push({
									id: id,
									file: file
								});
							}
						}
						entries.close();
						
						if (orphanQueue.length) {
							if (!orphaned.exists()) {
								orphaned.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, 0755);
							}
							for each(var orphan in orphanQueue) {
								var target = orphaned.clone();
								target.append(orphan.file.leafName);
								var newName = null;
								if (target.exists()) {
									try {
										target.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, 0644);
										newName = target.leafName;
									}
									catch (e) {
										// DEBUG: Work around createUnique() brokenness on Windows
										// as of Fx3.0.4 (https://bugzilla.mozilla.org/show_bug.cgi?id=452217)
										//
										// We just delete the conflicting file
										if (Zotero.isWin && e.name == 'NS_ERROR_FILE_ACCESS_DENIED') {
											target.remove(true);
										}
										else {
											throw (e);
										}
									}
									if (newName) {
										target.remove(false);
									}
								}
								orphan.file.moveTo(orphaned, newName);
								movedFiles37[orphan.id] = orphan.file;
							}
						}
						
						for each(var dir in renameQueue) {
							Zotero.debug("Moving " + dir.file.leafName + " to " + dir.key);
							dir.file.moveTo(null, dir.key);
							moveReport += dir.key + ' ' + dir.id + "\n";
							movedFiles37[dir.id] = dir.file;
						}
						
						if (moveReport) {
							moveReport = 'The following directory names in storage were changed:\n'
										+ '------------------------------------------------------\n'
										+ moveReport;
							Zotero.File.putContents(moveReportFile, moveReport);
						}
					}
					
					
					// Migrate big integers
					var itemIDs = Zotero.DB.columnQuery("SELECT itemID FROM items WHERE itemID>16777215");
					var smalls = Zotero.DB.columnQuery("SELECT itemID FROM items WHERE itemID<300000");
					var newID = smalls ? Math.max.apply(this, smalls) : 0;
					for each(var oldID in itemIDs) { 
						do {
							newID = newID + 1;
							var exists = Zotero.DB.valueQuery("SELECT COUNT(*) FROM items WHERE itemID=?", newID);
						}
						while (exists);
						var params = [newID, oldID];
						Zotero.DB.query("UPDATE items SET itemID=? WHERE itemID=?", params);
						Zotero.DB.query("UPDATE annotations SET itemID=? WHERE itemID=?", params);
						Zotero.DB.query("UPDATE collectionItems SET itemID=? WHERE itemID=?", params);
						Zotero.DB.query("UPDATE highlights SET itemID=? WHERE itemID=?", params);
						Zotero.DB.query("UPDATE itemCreators SET itemID=? WHERE itemID=?", params);
						Zotero.DB.query("UPDATE itemAttachments SET itemID=? WHERE itemID=?", params);
						Zotero.DB.query("UPDATE itemAttachments SET sourceItemID=? WHERE sourceItemID=?", params);
						Zotero.DB.query("UPDATE itemData SET itemID=? WHERE itemID=?", params);
						Zotero.DB.query("UPDATE itemNotes SET itemID=? WHERE itemID=?", params);
						Zotero.DB.query("UPDATE itemNotes SET sourceItemID=? WHERE sourceItemID=?", params);
						Zotero.DB.query("UPDATE itemSeeAlso SET itemID=? WHERE itemID=?", params);
						Zotero.DB.query("UPDATE itemSeeAlso SET linkedItemID=? WHERE linkedItemID=?", params);
						Zotero.DB.query("UPDATE itemTags SET itemID=? WHERE itemID=?", params);
						Zotero.DB.query("UPDATE fulltextItemWords SET itemID=? WHERE itemID=?", params);
						Zotero.DB.query("UPDATE fulltextItems SET itemID=? WHERE itemID=?", params);
					}
				}
				
				// 1.5 Sync Preview 2
				if (i==38) {
					var ids = Zotero.DB.columnQuery("SELECT itemID FROM items WHERE itemTypeID=14 AND itemID NOT IN (SELECT itemID FROM itemAttachments)");
					for each(var id in ids) {
						Zotero.DB.query("INSERT INTO itemAttachments (itemID, linkMode) VALUES (?, ?)", [id, 3]);
					}
				}
				
				if (i==39) {
					Zotero.DB.query("CREATE TABLE proxies (\n    proxyID INTEGER PRIMARY KEY,\n    multiHost INT,\n    autoAssociate INT,\n    scheme TEXT\n)");
					Zotero.DB.query("CREATE TABLE proxyHosts (\n    hostID INTEGER PRIMARY KEY,\n    proxyID INTEGER,\n    hostname TEXT,\n    FOREIGN KEY (proxyID) REFERENCES proxies(proxyID)\n)");
					Zotero.DB.query("CREATE INDEX proxyHosts_proxyID ON proxyHosts(proxyID)");
				}
				
				if (i==40) {
					Zotero.DB.query("ALTER TABLE itemAttachments ADD COLUMN syncState INT DEFAULT 0");
					Zotero.DB.query("ALTER TABLE itemAttachments ADD COLUMN storageModTime INT");
					Zotero.DB.query("CREATE INDEX itemAttachments_syncState ON itemAttachments(syncState)");
					Zotero.DB.query("CREATE TABLE storageDeleteLog (\n    key TEXT PRIMARY KEY,\n    timestamp INT NOT NULL\n)");
					Zotero.DB.query("CREATE INDEX storageDeleteLog_timestamp ON storageDeleteLog(timestamp)");
				}
				
				// 1.5 Sync Preview 2.2
				if (i==41) {
					var translators = Zotero.DB.query("SELECT * FROM translators WHERE inRepository!=1");
					if (translators) {
						var dir = Zotero.getTranslatorsDirectory();
						if (dir.exists()) {
							dir.remove(true);
						}
						Zotero.getTranslatorsDirectory()
						for each(var row in translators) {
							var file = dir.clone();
							var fileName = Zotero.Translators.getFileNameFromLabel(row.label);
							file.append(fileName);
							var metadata = { translatorID: row.translatorID, translatorType: parseInt(row.translatorType), label: row.label, creator: row.creator, target: row.target ? row.target : null, minVersion: row.minVersion, maxVersion: row.maxVersion, priority: parseInt(row.priority), inRepository: row.inRepository == 1 ? true : false, lastUpdated: row.lastUpdated };
							var nsIJSON = Cc["@mozilla.org/dom/json;1"].createInstance(Ci.nsIJSON);
							var metadataJSON = nsIJSON.encode(metadata);
							var str = metadataJSON + "\n\n" + (row.detectCode ? row.detectCode + "\n\n" : "") + row.code;
							Zotero.debug("Extracting translator '" + row.label + "' from database");
							Zotero.File.putContents(file, str);
						}
						Zotero.Translators.init();
					}
					var styles = Zotero.DB.query("SELECT * FROM csl");
					if (styles) {
						var dir = Zotero.getStylesDirectory();
						if (dir.exists()) {
							dir.remove(true);
						}
						Zotero.getStylesDirectory()
						for each(var row in styles) {
							var file = dir.clone();
							var matches = row.cslID.match(/([^\/]+)$/);
							if (!matches) {
								continue;
							}
							file.append(matches[1]);
							Zotero.debug("Extracting styles '" + matches[1] + "' from database");
							Zotero.File.putContents(file, row.csl);
						}
						Zotero.Styles.init();
					}
					Zotero.DB.query("DROP TABLE translators");
					Zotero.DB.query("DROP TABLE csl");
				}
				
				if (i==42) {
					Zotero.DB.query("UPDATE itemAttachments SET syncState=0");
				}
				
				// 1.5 Sync Preview 2.3
				if (i==43) {
					Zotero.DB.query("UPDATE itemNotes SET note='<div class=\"zotero-note znv1\">' || TEXT2HTML(note) || '</div>' WHERE note NOT LIKE '<div class=\"zotero-note %'");
				}
				
				// 1.5 Sync Preview 3 (i==44)
				// 1.5 Sync Preview 3.1
				if (i==45) {
					Zotero.DB.query("DELETE FROM itemData WHERE valueID IN (SELECT valueID FROM itemDataValues WHERE value REGEXP '^\\s*$')");
					Zotero.DB.query("DELETE FROM itemDataValues WHERE value REGEXP '^\\s*$'");
					var rows = Zotero.DB.query("SELECT * FROM itemDataValues WHERE value REGEXP '(^\\s+|\\s+$)'");
					if (rows) {
						for each(var row in rows) {
							var trimmed = Zotero.Utilities.prototype.trim(row.value);
							var valueID = Zotero.DB.valueQuery("SELECT valueID FROM itemDataValues WHERE value=?", trimmed);
							if (valueID) {
								Zotero.DB.query("UPDATE OR REPLACE itemData SET valueID=? WHERE valueID=?", [valueID, row.valueID]);
								Zotero.DB.query("DELETE FROM itemDataValues WHERE valueID=?", row.valueID);
							}
							else {
								Zotero.DB.query("UPDATE itemDataValues SET value=? WHERE valueID=?", [trimmed, row.valueID]);
							}
						}
					}
					
					Zotero.DB.query("UPDATE creatorData SET firstName=TRIM(firstName), lastName=TRIM(lastName)");
					var rows = Zotero.DB.query("SELECT * FROM creatorData ORDER BY lastName, firstName, creatorDataID");
					if (rows) {
						for (var j=0; j<rows.length-1; j++) {
							var k = j + 1;
							while (k < rows.length &&
									rows[k].lastName == rows[j].lastName &&
									rows[k].firstName == rows[j].firstName &&
									rows[k].fieldMode == rows[j].fieldMode) {
								Zotero.DB.query("UPDATE creators SET creatorDataID=? WHERE creatorDataID=?", [rows[j].creatorDataID, rows[k].creatorDataID]);
								Zotero.DB.query("DELETE FROM creatorData WHERE creatorDataID=?", rows[k].creatorDataID);
								k++;
							}
						}
					}
					
					Zotero.DB.query("DELETE FROM itemTags WHERE tagID IN (SELECT tagID FROM tags WHERE name REGEXP '^\\s*$')");
					Zotero.DB.query("DELETE FROM tags WHERE name REGEXP '^\\s*$'");
					var rows = Zotero.DB.query("SELECT * FROM tags WHERE name REGEXP '(^\\s+|\\s+$)'");
					if (rows) {
						for each(var row in rows) {
							var trimmed = Zotero.Utilities.prototype.trim(row.name);
							var tagID = Zotero.DB.valueQuery("SELECT tagID FROM tags WHERE name=?", trimmed);
							if (tagID) {
								Zotero.DB.query("UPDATE OR REPLACE itemTags SET tagID=? WHERE tagID=?", [tagID, row.tagID]);
								Zotero.DB.query("DELETE FROM tags WHERE tagID=?", row.tagID);
							}
							else {
								Zotero.DB.query("UPDATE tags SET name=? WHERE tagID=?", [trimmed, row.tagID]);
							}
						}
					}
					
					Zotero.DB.query("UPDATE itemNotes SET note=TRIM(note)");
					Zotero.DB.query("UPDATE collections SET collectionName=TRIM(collectionName)");
					Zotero.DB.query("UPDATE savedSearches SET savedSearchName=TRIM(savedSearchName)");
				}
				
				// 1.5 Sync Preview 3.2
				if (i==46) {
					if (fromVersion < 37) {
						continue;
					}
					
					if (Zotero.Prefs.get('useDataDir')) {
						var dataDir = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
						dataDir.persistentDescriptor = Zotero.Prefs.get('dataDir');
					}
					else {
						var dataDir = Zotero.getProfileDirectory();
						dataDir.append('zotero');
					}
					if (!dataDir.exists() || !dataDir.isDirectory()){
						var e = { name: "NS_ERROR_FILE_NOT_FOUND" };
						throw (e);
					}
					var movedFiles46 = {};
					var orphaned = dataDir.clone();
					var storage46 = dataDir.clone();
					orphaned.append('orphaned-files');
					storage46.append('storage');
					var keys = {};
					var rows = Zotero.DB.query("SELECT itemID, key FROM items NATURAL JOIN itemAttachments");
					for each(var row in rows) {
						keys[row.itemID] = row.key;
					}
					if (storage46.exists()) {
						var entries = storage46.directoryEntries;
						entries.QueryInterface(Components.interfaces.nsIDirectoryEnumerator);
						var file;
						var renameQueue = [];
						var orphanQueue = [];
						while (file = entries.nextFile) {
							var id = parseInt(file.leafName);
							if (!file.isDirectory() || file.leafName != id) {
								continue;
							}
							if (keys[id]) {
								var renameTarget = storage46.clone();
								renameTarget.append(keys[id]);
								if (renameTarget.exists()) {
									orphanQueue.push({
										id: id,
										file: renameTarget
									});
								}
								renameQueue.push({
									id: id,
									file: file,
									key: keys[id]
								});
							}
							else {
								orphanQueue.push({
									id: id,
									file: file
								});
							}
						}
						entries.close();
						
						if (orphanQueue.length) {
							if (!orphaned.exists()) {
								orphaned.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, 0755);
							}
							for each(var orphan in orphanQueue) {
								var target = orphaned.clone();
								target.append(orphan.file.leafName);
								var newName = null;
								if (target.exists()) {
									try {
										target.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, 0644);
										newName = target.leafName;
									}
									catch (e) {
										// DEBUG: Work around createUnique() brokenness on Windows
										// as of Fx3.0.4 (https://bugzilla.mozilla.org/show_bug.cgi?id=452217)
										//
										// We just delete the conflicting file
										if (Zotero.isWin && e.name == 'NS_ERROR_FILE_ACCESS_DENIED') {
											target.remove(true);
										}
										else {
											throw (e);
										}
									}
									if (newName) {
										target.remove(false);
									}
								}
								orphan.file.moveTo(orphaned, newName);
								movedFiles46[orphan.id] = orphan.file;
							}
						}
						
						for each(var dir in renameQueue) {
							Zotero.debug("Moving " + dir.file.leafName + " to " + dir.key);
							dir.file.moveTo(null, dir.key);
							movedFiles46[dir.id] = dir.file;
						}
					}
				}
				
				// 1.5 Sync Preview 3.6
				if (i==47) {
					Zotero.DB.query("ALTER TABLE syncDeleteLog RENAME TO syncDeleteLogOld");
					Zotero.DB.query("DROP INDEX syncDeleteLog_timestamp");
					Zotero.DB.query("CREATE TABLE syncDeleteLog (\n    syncObjectTypeID INT NOT NULL,\n    key TEXT NOT NULL UNIQUE,\n    timestamp INT NOT NULL,\n    FOREIGN KEY (syncObjectTypeID) REFERENCES syncObjectTypes(syncObjectTypeID)\n);");
					Zotero.DB.query("CREATE INDEX syncDeleteLog_timestamp ON syncDeleteLog(timestamp);");
					Zotero.DB.query("INSERT OR IGNORE INTO syncDeleteLog SELECT syncObjectTypeID, key, timestamp FROM syncDeleteLogOld ORDER BY timestamp DESC");
					Zotero.DB.query("DROP TABLE syncDeleteLogOld");
				}
				
				// 1.5 Sync Preview 3.7
				if (i==48) {
					Zotero.DB.query("CREATE TABLE deletedItems (\n    itemID INTEGER PRIMARY KEY,\n    dateDeleted DEFAULT CURRENT_TIMESTAMP NOT NULL\n);");
				}
				
				if (i==49) {
					Zotero.DB.query("ALTER TABLE collections RENAME TO collectionsOld");
					Zotero.DB.query("DROP INDEX creators_creatorDataID");
					Zotero.DB.query("ALTER TABLE creators RENAME TO creatorsOld");
					Zotero.DB.query("ALTER TABLE savedSearches RENAME TO savedSearchesOld");
					Zotero.DB.query("ALTER TABLE tags RENAME TO tagsOld");
					
					Zotero.DB.query("CREATE TABLE collections (\n    collectionID INTEGER PRIMARY KEY,\n    collectionName TEXT,\n    parentCollectionID INT,\n    dateAdded DEFAULT CURRENT_TIMESTAMP NOT NULL,\n    dateModified DEFAULT CURRENT_TIMESTAMP NOT NULL,\n    key TEXT NOT NULL UNIQUE,\n    FOREIGN KEY (parentCollectionID) REFERENCES collections(collectionID)\n);");
					Zotero.DB.query("CREATE TABLE creators (\n    creatorID INTEGER PRIMARY KEY,\n    creatorDataID INT NOT NULL,\n    dateAdded DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,\n    dateModified DEFAULT CURRENT_TIMESTAMP NOT NULL,\n    key TEXT NOT NULL UNIQUE,\n    FOREIGN KEY (creatorDataID) REFERENCES creatorData(creatorDataID)\n);");
					Zotero.DB.query("CREATE TABLE savedSearches (\n    savedSearchID INTEGER PRIMARY KEY,\n    savedSearchName TEXT,\n    dateAdded DEFAULT CURRENT_TIMESTAMP NOT NULL,\n    dateModified DEFAULT CURRENT_TIMESTAMP NOT NULL,\n    key TEXT NOT NULL UNIQUE\n);");
					Zotero.DB.query("CREATE TABLE tags (\n    tagID INTEGER PRIMARY KEY,\n    name TEXT COLLATE NOCASE,\n    type INT NOT NULL,\n    dateAdded DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,\n    dateModified DEFAULT CURRENT_TIMESTAMP NOT NULL,\n    key TEXT NOT NULL UNIQUE,\n    UNIQUE (name, type)\n);");
					
					Zotero.DB.query("INSERT INTO collections SELECT collectionID, collectionName, parentCollectionID, dateModified, dateModified, key FROM collectionsOld");
					Zotero.DB.query("INSERT INTO creators SELECT creatorID, creatorDataID, dateModified, dateModified, key FROM creatorsOld");
					Zotero.DB.query("INSERT INTO savedSearches SELECT savedSearchID, savedSearchName, dateModified, dateModified, key FROM savedSearchesOld");
					Zotero.DB.query("INSERT INTO tags SELECT tagID, name, type, dateModified, dateModified, key FROM tagsOld");
					
					Zotero.DB.query("CREATE INDEX creators_creatorDataID ON creators(creatorDataID);");
					
					Zotero.DB.query("DROP TABLE collectionsOld");
					Zotero.DB.query("DROP TABLE creatorsOld");
					Zotero.DB.query("DROP TABLE savedSearchesOld");
					Zotero.DB.query("DROP TABLE tagsOld");
				}
				
				// 1.5 Beta 3
				if (i==50) {
					Zotero.DB.query("DELETE FROM proxyHosts");
					Zotero.DB.query("DELETE FROM proxies");
				}
				
				if (i==51) {
					Zotero.DB.query("ALTER TABLE collections RENAME TO collectionsOld");
					Zotero.DB.query("DROP INDEX creators_creatorDataID");
					Zotero.DB.query("ALTER TABLE creators RENAME TO creatorsOld");
					Zotero.DB.query("ALTER TABLE items RENAME TO itemsOld")
					Zotero.DB.query("ALTER TABLE savedSearches RENAME TO savedSearchesOld");
					Zotero.DB.query("ALTER TABLE tags RENAME TO tagsOld");
					
					Zotero.DB.query("CREATE TABLE collections (\n    collectionID INTEGER PRIMARY KEY,\n    collectionName TEXT NOT NULL,\n    parentCollectionID INT DEFAULT NULL,\n    dateAdded TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    dateModified TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    clientDateModified TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    libraryID INT,\n    key TEXT NOT NULL,\n    UNIQUE (libraryID, key),\n    FOREIGN KEY (parentCollectionID) REFERENCES collections(collectionID)\n);");
					Zotero.DB.query("CREATE TABLE creators (\n    creatorID INTEGER PRIMARY KEY,\n    creatorDataID INT NOT NULL,\n    dateAdded TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    dateModified TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    clientDateModified TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    libraryID INT,\n    key TEXT NOT NULL,\n    UNIQUE (libraryID, key),\n    FOREIGN KEY (creatorDataID) REFERENCES creatorData(creatorDataID)\n);");
					Zotero.DB.query("CREATE TABLE items (\n    itemID INTEGER PRIMARY KEY,\n    itemTypeID INT NOT NULL,\n    dateAdded TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    dateModified TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    clientDateModified TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    libraryID INT,\n    key TEXT NOT NULL,\n    UNIQUE (libraryID, key)\n);");
					Zotero.DB.query("CREATE TABLE savedSearches (\n    savedSearchID INTEGER PRIMARY KEY,\n    savedSearchName TEXT NOT NULL,\n    dateAdded TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    dateModified TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    clientDateModified TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    libraryID INT,\n    key TEXT NOT NULL,\n    UNIQUE (libraryID, key)\n);");
					Zotero.DB.query("CREATE TABLE tags (\n    tagID INTEGER PRIMARY KEY,\n    name TEXT NOT NULL COLLATE NOCASE,\n    type INT NOT NULL,\n    dateAdded TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    dateModified TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    clientDateModified TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    libraryID INT,\n    key TEXT NOT NULL,\n    UNIQUE (libraryID, name, type),\n    UNIQUE (libraryID, key)\n);\n");
					
					Zotero.DB.query("INSERT INTO collections SELECT collectionID, collectionName, parentCollectionID, dateAdded, dateModified, dateModified, NULL, key FROM collectionsOld");
					Zotero.DB.query("INSERT INTO creators SELECT creatorID, creatorDataID, dateAdded, dateModified, dateModified, NULL, key FROM creatorsOld");
					Zotero.DB.query("INSERT INTO items SELECT itemID, itemTypeID, dateAdded, dateModified, dateModified, NULL, key FROM itemsOld");
					Zotero.DB.query("INSERT INTO savedSearches SELECT savedSearchID, savedSearchName, dateAdded, dateModified, dateModified, NULL, key FROM savedSearchesOld");
					Zotero.DB.query("INSERT INTO tags SELECT tagID, name, type, dateAdded, dateModified, dateModified, NULL, key FROM tagsOld");
					
					Zotero.DB.query("CREATE INDEX creators_creatorDataID ON creators(creatorDataID);");
					
					Zotero.DB.query("DROP TABLE collectionsOld");
					Zotero.DB.query("DROP TABLE creatorsOld");
					Zotero.DB.query("DROP TABLE itemsOld");
					Zotero.DB.query("DROP TABLE savedSearchesOld");
					Zotero.DB.query("DROP TABLE tagsOld");
					
					Zotero.DB.query("CREATE TABLE libraries (\n    libraryID INTEGER PRIMARY KEY,\n    libraryType TEXT NOT NULL\n);");
					Zotero.DB.query("CREATE TABLE users (\n    userID INTEGER PRIMARY KEY,\n    username TEXT NOT NULL\n);");
					Zotero.DB.query("CREATE TABLE groups (\n    groupID INTEGER PRIMARY KEY,\n    libraryID INT NOT NULL UNIQUE,\n    name TEXT NOT NULL,\n    description TEXT NOT NULL,\n    editable INT NOT NULL,\n    filesEditable INT NOT NULL,\n    FOREIGN KEY (libraryID) REFERENCES libraries(libraryID)\n);");
					Zotero.DB.query("CREATE TABLE groupItems (\n    itemID INTEGER PRIMARY KEY,\n    createdByUserID INT NOT NULL,\n    lastModifiedByUserID INT NOT NULL,\n    FOREIGN KEY (createdByUserID) REFERENCES users(userID),\n    FOREIGN KEY (lastModifiedByUserID) REFERENCES users(userID)\n);");
					
					Zotero.DB.query("ALTER TABLE syncDeleteLog RENAME TO syncDeleteLogOld");
					Zotero.DB.query("DROP INDEX syncDeleteLog_timestamp");
					Zotero.DB.query("CREATE TABLE syncDeleteLog (\n    syncObjectTypeID INT NOT NULL,\n    libraryID INT,\n    key TEXT NOT NULL,\n    timestamp INT NOT NULL,\n    UNIQUE (libraryID, key),\n    FOREIGN KEY (syncObjectTypeID) REFERENCES syncObjectTypes(syncObjectTypeID)\n);");
					Zotero.DB.query("INSERT INTO syncDeleteLog SELECT syncObjectTypeID, NULL, key, timestamp FROM syncDeleteLogOld");
					Zotero.DB.query("CREATE INDEX syncDeleteLog_timestamp ON syncDeleteLog(timestamp)");
					Zotero.DB.query("DROP TABLE syncDeleteLogOld");
					
					Zotero.DB.query("ALTER TABLE storageDeleteLog RENAME TO storageDeleteLogOld");
					Zotero.DB.query("DROP INDEX storageDeleteLog_timestamp");
					Zotero.DB.query("CREATE TABLE storageDeleteLog (\n    libraryID INT,\n    key TEXT NOT NULL,\n    timestamp INT NOT NULL,\n    PRIMARY KEY (libraryID, key)\n);");
					Zotero.DB.query("INSERT INTO storageDeleteLog SELECT NULL, key, timestamp FROM storageDeleteLogOld");
					Zotero.DB.query("CREATE INDEX storageDeleteLog_timestamp ON storageDeleteLog(timestamp)");
					Zotero.DB.query("DROP TABLE storageDeleteLogOld");
					
					Zotero.DB.query("CREATE TEMPORARY TABLE tmpUpdatedItems (itemID INTEGER PRIMARY KEY)");
					Zotero.DB.query("INSERT INTO tmpUpdatedItems SELECT itemID FROM items NATURAL JOIN itemData WHERE fieldID=10 AND itemTypeID IN (2,9)");
					Zotero.DB.query("UPDATE itemData SET fieldID=118 WHERE fieldID=10 AND itemID IN (SELECT itemID FROM tmpUpdatedItems)");
					Zotero.DB.query("DROP TABLE tmpUpdatedItems");
				}
				
				if (i==52) {
					Zotero.DB.query("CREATE TABLE relations (\n    libraryID INT NOT NULL,\n    subject TEXT NOT NULL,\n    predicate TEXT NOT NULL,\n    object TEXT NOT NULL,\n    clientDateModified TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    PRIMARY KEY (libraryID, subject, predicate, object)\n)");
					Zotero.DB.query("CREATE INDEX relations_object ON relations(libraryID, object)")
				}
				
				if (i==53) {
					Zotero.DB.query("DELETE FROM collectionItems WHERE itemID IN (SELECT itemID FROM items WHERE itemID IN (SELECT itemID FROM itemAttachments WHERE sourceItemID IS NOT NULL) OR itemID IN (SELECT itemID FROM itemNotes WHERE sourceItemID IS NOT NULL))");
				}
				
				if (i==54) {
					Zotero.DB.query("UPDATE creatorData SET shortName='' WHERE shortName IS NULL");
					Zotero.DB.query("UPDATE creatorData SET birthYear=NULL WHERE birthYear=''");
				}
				
				if (i==55) {
					Zotero.DB.query("CREATE TEMPORARY TABLE tmpEmptyCreators AS SELECT creatorID FROM creators WHERE creatorDataID IN (SELECT creatorDataID FROM creatorData WHERE firstName='' AND lastName='')");
					Zotero.DB.query("INSERT INTO syncDeleteLog SELECT 2, libraryID, key, CURRENT_TIMESTAMP FROM creators WHERE creatorID IN (SELECT creatorID FROM tmpEmptyCreators)");
					var rows = Zotero.DB.query("SELECT * FROM itemCreators WHERE creatorID IN (SELECT creatorID FROM tmpEmptyCreators) ORDER BY orderIndex DESC");
					for each(var row in rows) {
						Zotero.DB.query("DELETE FROM itemCreators WHERE itemID=? AND creatorID=? AND orderIndex=?", [row.itemID, row.creatorID, row.orderIndex]);
						Zotero.DB.query("UPDATE itemCreators SET orderIndex=orderIndex-1 WHERE itemID=? AND orderIndex>?", [row.itemID, row.orderIndex]);
					}
					Zotero.DB.query("DELETE FROM itemCreators WHERE creatorID IN (SELECT creatorID FROM tmpEmptyCreators)");
					Zotero.DB.query("DELETE FROM creators WHERE creatorDataID IN (SELECT creatorDataID FROM creatorData WHERE firstName='' AND lastName='')");
					Zotero.DB.query("DROP TABLE tmpEmptyCreators");
					Zotero.DB.query("DELETE FROM creatorData WHERE firstName='' AND lastName=''");
				}
				
				if (i==56) {
					Zotero.DB.query("UPDATE itemAttachments SET mimeType=charsetID, charsetID=NULL WHERE charsetID REGEXP '[a-zA-Z0-9\-]+/[a-zA-Z0-9\-]'");
				}
				
				if (i==57) {
					Zotero.DB.query("UPDATE itemAttachments SET linkMode=0, mimeType=NULL WHERE linkMode IS NULL AND mimeType=0");
				}
				
				if (i==58) {
					if (!Zotero.DB.valueQuery("SELECT COUNT(*) FROM version WHERE schema='syncdeletelog'") && Zotero.DB.valueQuery("SELECT COUNT(*) FROM syncDeleteLog")) {
						Zotero.DB.query("INSERT INTO version VALUES ('syncdeletelog', CURRENT_TIMESTAMP)");
					}
				}
				
				if (i==59) {
					var namestr = '[Missing Name]';
					var id = Zotero.DB.valueQuery("SELECT creatorDataID FROM creatorData WHERE firstName='' AND lastName=? AND fieldMode=1", namestr);
					if (!id) {
						id = Zotero.DB.query("INSERT INTO creatorData (firstName, lastName, fieldMode) VALUES ('', ?, 1)", namestr);
					}
					var creatorID = Zotero.DB.valueQuery("SELECT creatorID FROM creators WHERE creatorDataID=?", id);
					if (!creatorID) {
						var key = Zotero.ID.getKey();
						creatorID = Zotero.DB.query("INSERT INTO creators (creatorDataID, key) VALUES (?, ?)", [id, key]);
					}
					Zotero.DB.query("UPDATE itemCreators SET creatorID=? WHERE creatorID NOT IN (SELECT creatorID FROM creators)", creatorID);
				}
				
				if (i==60) {
					Zotero.DB.query("DROP TRIGGER IF EXISTS fki_itemAttachments_libraryID");
					Zotero.DB.query("DROP TRIGGER IF EXISTS fku_itemAttachments_libraryID");
					Zotero.DB.query("DROP TRIGGER IF EXISTS fki_itemNotes_libraryID");
					Zotero.DB.query("DROP TRIGGER IF EXISTS fku_itemNotes_libraryID");
					Zotero.DB.query("DELETE FROM collectionItems WHERE itemID IN (SELECT itemID FROM items NATURAL JOIN itemAttachments WHERE sourceItemID IS NOT NULL UNION SELECT itemID FROM items NATURAL JOIN itemNotes WHERE sourceItemID IS NOT NULL)");
					Zotero.DB.query("UPDATE itemAttachments SET sourceItemID=NULL WHERE sourceItemID=itemID");
					Zotero.DB.query("UPDATE itemNotes SET sourceItemID=NULL WHERE sourceItemID=itemID");
				}
			}
			
			_updateDBVersion('userdata', toVersion);
			
			Zotero.DB.commitTransaction();
		}
		catch (e) {
			if (movedFiles37) {
				for (var id in movedFiles37) {
					try {
						movedFiles37[id].moveTo(storage37, id);
					}
					catch (e2) { Zotero.debug(e2); }
				}
			}
			if (movedFiles46) {
				for (var id in movedFiles46) {
					try {
						movedFiles46[id].moveTo(storage46, id);
					}
					catch (e2) { Zotero.debug(e2); }
				}
			}
			Zotero.DB.rollbackTransaction();
			
			// Display more helpful message on errors due to open files
			//
			// Conditional should be same as in showUpgradeWizard()
			if (e.name && e.name == "NS_ERROR_FAILURE" && e.message.match(/nsIFile\.moveTo/)) {
				// TODO: localize
				var pr = Components.classes["@mozilla.org/network/default-prompt;1"]
							.getService(Components.interfaces.nsIPrompt);
				var title = "Upgrade Failed";
				var couldNotMigrate = "Zotero could not migrate all necessary files.";
				var closeAttachmentFiles = "Please close any open attachment files and restart Firefox to try the upgrade again.";
				var restartYourComputer = "If you continue to receive this message, restart your computer.";
				pr.alert(title, Zotero.localeJoin([couldNotMigrate, closeAttachmentFiles]) + "\n\n" + restartYourComputer);
			}
			
			throw(e);
		}
		
		return true;
	}
}
