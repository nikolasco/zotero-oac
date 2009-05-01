Zotero.Sync = new function() {
	this.init = init;
	this.getObjectTypeID = getObjectTypeID;
	this.getObjectTypeName = getObjectTypeName;
	this.getDeletedObjects = getDeletedObjects;
	this.purgeDeletedObjects = purgeDeletedObjects;
	
	// Keep in sync with syncObjectTypes table
	this.__defineGetter__('syncObjects', function () {
		return {
			creator: {
				singular: 'Creator',
				plural: 'Creators'
			},
			item: {
				singular: 'Item',
				plural: 'Items'
			},
			collection: {
				singular: 'Collection',
				plural: 'Collections'
			},
			search: {
				singular: 'Search',
				plural: 'Searches'
			},
			tag: {
				singular: 'Tag',
				plural: 'Tags'
			}

		};
	});
	
	default xml namespace = '';
	
	var _typesLoaded = false;
	var _objectTypeIDs = {};
	var _objectTypeNames = {};
	
	var _deleteLogDays = 30;
	
	
	function init() {
		var sql = "SELECT version FROM version WHERE schema='syncdeletelog'";
		if (!Zotero.DB.valueQuery(sql)) {
			sql = "SELECT COUNT(*) FROM syncDeleteLog";
			if (Zotero.DB.valueQuery(sql)) {
				throw ('syncDeleteLog not empty and no timestamp in Zotero.Sync.delete()');
			}
			sql = "INSERT INTO version VALUES ('syncdeletelog', ?)";
			Zotero.DB.query(sql, Zotero.Date.getUnixTimestamp());
		}
		
		this.EventListener.init();
	}
	
	
	function getObjectTypeID(type) {
		if (!_typesLoaded) {
			_loadObjectTypes();
		}
		
		var id = _objectTypeIDs[type];
		return id ? id : false;
	}
	
	
	function getObjectTypeName(typeID, plural) {
		if (!_typesLoaded) {
			_loadObjectTypes();
		}
		
		var name = _objectTypeNames[typeID];
		return name ? name : false;
	}
	
	
	/**
	 * @param	{Date} olderThanDate		Retrieve objects last updated before this date
	 * @param	{Date} newerThanDate		Retrieve objects last updated after this date
	 * @return	{Object}		{ items: [123, 234, ...], creators: [321, 432, ...], ... }
	 */
	this.getObjectsByDate = function (olderThanDate, newerThanDate) {
		var funcName = "Zotero.Sync.getObjectsByDate()";
		if (olderThanDate && olderThanDate.constructor.name != 'Date') {
			throw ("olderThanDate must be a Date or FALSE in " + funcName)
		}
		if (newerThanDate && newerThanDate.constructor.name != 'Date') {
			throw ("newerThanDate must be a Date or FALSE in " + funcName)
		}
		
		// If dates overlap, retrieve all objects
		if (!olderThanDate && !newerThanDate) {
			var all = true;
		}
		else if (olderThanDate && newerThanDate && olderThanDate > newerThanDate) {
			olderThanDate = null;
			newerThanDate = null;
			var all = true;
		}
		
		var updatedIDs = {};
		for each(var syncObject in this.syncObjects) {
			var Types = syncObject.plural; // 'Items'
			var types = syncObject.plural.toLowerCase(); // 'items'
			
			Zotero.debug("Getting updated local " + types);
			
			if (olderThanDate) {
				var earlierIDs = Zotero[Types].getOlder(olderThanDate);
				if (earlierIDs) {
					updatedIDs[types] = earlierIDs;
				}
			}
			
			if (newerThanDate || all) {
				var laterIDs = Zotero[Types].getNewer(newerThanDate);
				if (laterIDs) {
					if (updatedIDs[types]) {
						updatedIDs[types].concat(laterIDs);
					}
					else {
						updatedIDs[types] = laterIDs;
					}
				}
			}
			
			if (!updatedIDs[types]) {
				updatedIDs[types] = [];
			}
		}
		return updatedIDs;
	}
	
	
	/**
	 * @param	object	lastSyncDate	JS Date object
	 * @return	mixed
	 *		{
	 *			items: [ 'ABCD1234', 'BCDE2345', ... ]
	 *			creators: [ 'ABCD1234', 'BCDE2345', ... ],
	 *			...
	 *		}
	 * or FALSE if none or -1 if last sync time is before start of log
	 */
	function getDeletedObjects(lastSyncDate) {
		if (lastSyncDate && lastSyncDate.constructor.name != 'Date') {
			throw ('lastSyncDate must be a Date or FALSE in '
				+ 'Zotero.Sync.getDeletedObjects()')
		}
		
		var sql = "SELECT version FROM version WHERE schema='syncdeletelog'";
		var syncLogStart = Zotero.DB.valueQuery(sql);
		if (!syncLogStart) {
			throw ('syncLogStart not found in Zotero.Sync.getDeletedObjects()');
		}
		
		// Last sync time is before start of log
		if (lastSyncDate && new Date(syncLogStart * 1000) > lastSyncDate) {
			return -1;
		}
		
		var param = false;
		var sql = "SELECT syncObjectTypeID, key FROM syncDeleteLog";
		if (lastSyncDate) {
			param = Zotero.Date.toUnixTimestamp(lastSyncDate);
			sql += " WHERE timestamp>?";
		}
		sql += " ORDER BY timestamp";
		var rows = Zotero.DB.query(sql, param);
		
		if (!rows) {
			return false;
		}
		
		var deletedKeys = {};
		for each(var syncObject in this.syncObjects) {
			deletedKeys[syncObject.plural.toLowerCase()] = [];
		}
		
		for each(var row in rows) {
			var type = this.getObjectTypeName(row.syncObjectTypeID);
			type = this.syncObjects[type].plural.toLowerCase()
			deletedKeys[type].push(row.key);
		}
		return deletedKeys;
	}
	
	
	/**
	 * @param	int		deleteOlderThan		Unix timestamp
	 */
	function purgeDeletedObjects(deleteOlderThan) {
		if (isNaN(parseInt(deleteOlderThan))) {
			throw ("Invalid timestamp '" + deleteOlderThan
				+ "' in Zotero.Sync.purgeDeletedObjects");
		}
		var sql = "DELETE FROM syncDeleteLog WHERE timestamp<?";
		Zotero.DB.query(sql, { int: deleteOlderThan });
	}
	
	
	function _loadObjectTypes() {
		var sql = "SELECT * FROM syncObjectTypes";
		var types = Zotero.DB.query(sql);
		for each(var type in types) {
			_objectTypeNames[type.syncObjectTypeID] = type.name;
			_objectTypeIDs[type.name] = type.syncObjectTypeID;
		}
		_typesLoaded = true;
	}
}



/**
 * Notifier observer to add deleted objects to syncDeleteLog/storageDeleteLog
 * 		plus related methods
 */
Zotero.Sync.EventListener = new function () {
	default xml namespace = '';
	
	this.init = init;
	this.ignoreDeletions = ignoreDeletions;
	this.unignoreDeletions = unignoreDeletions;
	this.notify = notify;
	
	var _deleteBlacklist = {};
	
	
	function init() {
		// Initialize delete log listener
		Zotero.Notifier.registerObserver(this);
	}
	
	
	/**
	 * Blacklist objects from going into the sync delete log
	 */
	function ignoreDeletions(type, ids) {
		if (!Zotero.Sync.syncObjects[type]) {
			throw ("Invalid type '" + type +
				"' in Zotero.Sync.EventListener.ignoreDeletions()");
		}
		
		if (!_deleteBlacklist[type]) {
			_deleteBlacklist[type] = {};
		}
		
		ids = Zotero.flattenArguments(ids);
		for each(var id in ids) {
			_deleteBlacklist[type][id] = true;
		}
	}
	
	
	/**
	 * Remove objects blacklisted from the sync delete log
	 */
	function unignoreDeletions(type, ids) {
		if (!Zotero.Sync.syncObjects[type]) {
			throw ("Invalid type '" + type +
				"' in Zotero.Sync.EventListener.ignoreDeletions()");
		}
		
		ids = Zotero.flattenArguments(ids);
		for each(var id in ids) {
			if (_deleteBlacklist[type][id]) {
				delete _deleteBlacklist[type][id];
			}
		}
	}
	
	
	function notify(event, type, ids, extraData) {
		var objectTypeID = Zotero.Sync.getObjectTypeID(type);
		if (!objectTypeID) {
			return;
		}
		
		var isItem = Zotero.Sync.getObjectTypeName(objectTypeID) == 'item';
		
		var ZU = new Zotero.Utilities;
		
		Zotero.DB.beginTransaction();
		
		if (event == 'delete') {
			var sql = "INSERT INTO syncDeleteLog VALUES (?, ?, ?)";
			var syncStatement = Zotero.DB.getStatement(sql);
			
			if (isItem && Zotero.Sync.Storage.active) {
				var storageEnabled = true;
				var sql = "INSERT INTO storageDeleteLog VALUES (?, ?)";
				var storageStatement = Zotero.DB.getStatement(sql);
			}
			var storageBound = false;
			
			var ts = Zotero.Date.getUnixTimestamp();
			
			for (var i=0, len=ids.length; i<len; i++) {
				if (_deleteBlacklist[ids[i]]) {
					Zotero.debug("Not logging blacklisted '"
						+ type + "' id " + ids[i]
						+ " in Zotero.Sync.EventListener.notify()", 4);
					continue;
				}
				
				var oldItem = extraData[ids[i]].old;
				var key = oldItem.primary.key;
				
				if (!key) {
					throw("Key not provided in notifier object in "
						+ "Zotero.Sync.EventListener.notify()");
				}
				
				syncStatement.bindInt32Parameter(0, objectTypeID);
				syncStatement.bindStringParameter(1, key);
				syncStatement.bindInt32Parameter(2, ts);
				
				if (storageEnabled &&
						oldItem.primary.itemType == 'attachment' &&
						[
							Zotero.Attachments.LINK_MODE_IMPORTED_FILE,
							Zotero.Attachments.LINK_MODE_IMPORTED_URL
						].indexOf(oldItem.attachment.linkMode) != -1) {
					storageStatement.bindStringParameter(0, key);
					storageStatement.bindInt32Parameter(1, ts);
					storageBound = true;
				}
				
				try {
					syncStatement.execute();
					if (storageBound) {
						storageStatement.execute();
						storageBound = false;
					}
				}
				catch(e) {
					syncStatement.reset();
					if (storageEnabled) {
						storageStatement.reset();
					}
					Zotero.DB.rollbackTransaction();
					throw(Zotero.DB.getLastErrorString());
				}
			}
			
			syncStatement.reset();
			if (storageEnabled) {
				storageStatement.reset();
			}
		}
		
		Zotero.DB.commitTransaction();
	}
}


Zotero.Sync.Runner = new function () {
	this.__defineGetter__("lastSyncError", function () {
		return _lastSyncError;
	});
	
	this.__defineGetter__("background", function () {
		return _background;
	});
	
	var _lastSyncError;
	var _autoSyncTimer;
	var _queue;
	var _running;
	var _background;
	
	this.init = function () {
		this.EventListener.init();
		this.IdleListener.init();
	}
	
	this.sync = function (background) {
		if (Zotero.Utilities.HTTP.browserIsOffline()){
			_lastSyncError = "Browser is offline"; // TODO: localize
			this.clearSyncTimeout(); // DEBUG: necessary?
			this.setSyncIcon('error');
			return false;
		}
		
		if (_running) {
			throw ("Sync already running in Zotero.Sync.Runner.sync()");
		}
		
		_background = !!background;
		
		_queue = [
			Zotero.Sync.Server.sync,
			Zotero.Sync.Storage.sync,
			Zotero.Sync.Server.sync,
			Zotero.Sync.Storage.sync
		];
		_running = true;
		_lastSyncError = '';
		this.setSyncIcon('animate');
		this.next();
	}
	
	
	this.next = function () {
		if (!_queue.length) {
			this.setSyncIcon();
			_running = false;
			return;
		}
		var func = _queue.shift();
		func();
	}
	
	
	this.setError = function (msg) {
		this.setSyncIcon('error');
		_lastSyncError = msg;
	}
	
	
	this.reset = function () {
		_queue = [];
		_running = false;
	}
	
	
	/**
	 * @param	{Integer}	[timeout=15]		Timeout in seconds
	 * @param	{Boolean}	[recurring=false]
	 * @param	{Boolean}	[background]		Triggered sync is a background sync
	 */
	this.setSyncTimeout = function (timeout, recurring, background) {
		// check if server/auto-sync are enabled?
		
		if (!timeout) {
			var timeout = 15;
		}
		
		if (_autoSyncTimer) {
			Zotero.debug("CANCELLING");
			_autoSyncTimer.cancel();
		}
		else {
			_autoSyncTimer = Components.classes["@mozilla.org/timer;1"].
				createInstance(Components.interfaces.nsITimer);
		}
		
		// Implements nsITimerCallback
		var callback = {
			notify: function (timer) {
				if (!Zotero.Sync.Server.enabled) {
					return;
				}
				
				if (Zotero.Sync.Storage.syncInProgress) {
					Zotero.debug('Storage sync already in progress -- skipping auto-sync', 4);
					return;
				}
				
				if (Zotero.Sync.Server.syncInProgress) {
					Zotero.debug('Sync already in progress -- skipping auto-sync', 4);
					return;
				}
				Zotero.Sync.Runner.sync(background);
			}
		}
		
		if (recurring) {
			Zotero.debug('Setting auto-sync interval to ' + timeout + ' seconds');
			_autoSyncTimer.initWithCallback(
				callback, timeout * 1000, Components.interfaces.nsITimer.TYPE_REPEATING_SLACK
			);
		}
		else {
			Zotero.debug('Setting auto-sync timeout to ' + timeout + ' seconds');
			_autoSyncTimer.initWithCallback(
				callback, timeout * 1000, Components.interfaces.nsITimer.TYPE_ONE_SHOT
			);
		}
	}
	
	
	this.clearSyncTimeout = function () {
		if (_autoSyncTimer) {
			_autoSyncTimer.cancel();
		}
	}
	
	
	this.setSyncIcon = function (status) {
		status = status ? status : '';
		
		switch (status) {
			case '':
			case 'animate':
			case 'error':
				break;
			
		default:
			throw ("Invalid sync icon status '" + status
					+ "' in Zotero.Sync.Runner.setSyncIcon()");
		}
		
		var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
			.getService(Components.interfaces.nsIWindowMediator);
		var win = wm.getMostRecentWindow('navigator:browser');
		var icon = win.document.getElementById('zotero-tb-sync');
		icon.setAttribute('status', status);
		
		switch (status) {
			case 'animate':
				icon.setAttribute('disabled', true);
				break;
			
			default:
				icon.setAttribute('disabled', false);
		}
	}
}


Zotero.Sync.Runner.EventListener = {
	init: function () {
		// Initialize save observer
		Zotero.Notifier.registerObserver(this);
	},
	
	notify: function (event, type, ids, extraData) {
		// TODO: skip others
		if (type == 'refresh') {
			return;
		}
		
		if (Zotero.Prefs.get('sync.autoSync') && Zotero.Sync.Server.enabled) {
			Zotero.Sync.Runner.setSyncTimeout();
		}
	}
}


Zotero.Sync.Runner.IdleListener = {
	_idleTimeout: 3600,
	_backTimeout: 900,
	
	init: function () {
		// DEBUG: Allow override for testing
		var idleTimeout = Zotero.Prefs.get("sync.autoSync.idleTimeout");
		if (idleTimeout) {
			this._idleTimeout = idleTimeout;
		}
		var backTimeout = Zotero.Prefs.get("sync.autoSync.backTimeout");
		if (backTimeout) {
			this._backTimeout = backTimeout;
		}
		
		if (Zotero.Prefs.get("sync.autoSync")) {
			this.register();
		}
	},
	
	register: function () {
		Zotero.debug("Initializing sync idle observer");
		var idleService = Components.classes["@mozilla.org/widget/idleservice;1"]
				.getService(Components.interfaces.nsIIdleService);
		idleService.addIdleObserver(this, this._idleTimeout);
		idleService.addIdleObserver(this._backObserver, this._backTimeout);
	},
	
	observe: function (subject, topic, data) {
		if (topic != 'idle') {
			return;
		}
		
		if (!Zotero.Sync.Server.enabled
				|| Zotero.Sync.Server.syncInProgress
				|| Zotero.Sync.Storage.syncInProgress) {
			return;
		}
		
		Zotero.debug("Beginning idle sync");
		Zotero.Sync.Runner.sync(true);
		Zotero.Sync.Runner.setSyncTimeout(this._idleTimeout, true);
	},
	
	_backObserver: {
		observe: function (subject, topic, data) {
			if (topic != 'back') {
				return;
			}
			
			Zotero.Sync.Runner.clearSyncTimeout();
			if (!Zotero.Sync.Server.enabled
					|| Zotero.Sync.Server.syncInProgress
					|| Zotero.Sync.Storage.syncInProgress) {
				return;
			}
			Zotero.debug("Beginning return-from-idle sync");
			Zotero.Sync.Runner.sync(true);
		}
	},
	
	unregister: function () {
		Zotero.debug("Stopping sync idle observer");
		var idleService = Components.classes["@mozilla.org/widget/idleservice;1"]
				.getService(Components.interfaces.nsIIdleService);
		idleService.removeIdleObserver(this, this._idleTimeout);
		idleService.removeIdleObserver(this._backObserver, this._backTimeout);
	}
}



/**
 * Methods for syncing with the Zotero Server
 */
Zotero.Sync.Server = new function () {
	this.login = login;
	this.sync = sync;
	this.lock = lock;
	this.unlock = unlock;
	this.clear = clear;
	this.resetServer = resetServer;
	this.resetClient = resetClient;
	this.logout = logout;
	
	this.__defineGetter__('enabled', function () {
		if (_throttleTimeout && new Date() < _throttleTimeout) {
			Zotero.debug("Auto-syncing is disabled until " + Zotero.Date.dateToSQL(_throttleTimeout) + " -- skipping sync");
			return false;
		}
		
		// Set auto-sync expiry
		var expiry = new Date("May 15, 2009 12:00:00");
		if (new Date() > expiry) {
			Components.utils.reportError("Build has expired -- syncing disabled");
			return false;
		}
		
		return this.username && this.password;
	});
	
	this.__defineGetter__('username', function () {
		return Zotero.Prefs.get('sync.server.username');
	});
	
	this.__defineGetter__('password', function () {
		var username = this.username;

		if (!username) {
			Zotero.debug('Username not set before setting Zotero.Sync.Server.password');
			return '';
		}
		
		if (_cachedCredentials[username]) {
			return _cachedCredentials[username];
		}
		
		Zotero.debug('Getting Zotero sync password');
		var loginManager = Components.classes["@mozilla.org/login-manager;1"]
								.getService(Components.interfaces.nsILoginManager);
		var logins = loginManager.findLogins({}, _loginManagerHost, _loginManagerURL, null);
		
		// Find user from returned array of nsILoginInfo objects
		for (var i = 0; i < logins.length; i++) {
			if (logins[i].username == username) {
				_cachedCredentials[username] = logins[i].password;
				return logins[i].password;
			}
		}
		
		return '';
	});
	
	this.__defineSetter__('password', function (password) {
		_sessionID = null;
		
		var username = this.username;
		
		if (!username) {
			Zotero.debug('Username not set before setting Zotero.Sync.Server.password');
			return;
		}
		
		delete _cachedCredentials[username];
		
		var loginManager = Components.classes["@mozilla.org/login-manager;1"]
								.getService(Components.interfaces.nsILoginManager);
		
		var logins = loginManager.findLogins({}, _loginManagerHost, _loginManagerURL, null);
		
		for (var i = 0; i < logins.length; i++) {
			Zotero.debug('Clearing Zotero sync passwords');
			loginManager.removeLogin(logins[i]);
			break;
		}
		
		if (password) {
			var nsLoginInfo = new Components.Constructor("@mozilla.org/login-manager/loginInfo;1",
				Components.interfaces.nsILoginInfo, "init");
			
			Zotero.debug('Setting Zotero sync password');
			var loginInfo = new nsLoginInfo(_loginManagerHost, _loginManagerURL,
				null, username, password, "", "");
			loginManager.addLogin(loginInfo);
			_cachedCredentials[username] = password;
		}
	});
	
	this.__defineGetter__("syncInProgress", function () _syncInProgress);
	this.__defineGetter__("sessionIDComponent", function () {
		return 'sessionid=' + _sessionID;
	});
	this.__defineGetter__("lastRemoteSyncTime", function () {
		return Zotero.DB.valueQuery("SELECT version FROM version WHERE schema='lastremotesync'");
	});
	this.__defineSetter__("lastRemoteSyncTime", function (val) {
		Zotero.DB.query("REPLACE INTO version VALUES ('lastremotesync', ?)", { int: val });
	});
	this.__defineGetter__("lastLocalSyncTime", function () {
		return Zotero.DB.valueQuery("SELECT version FROM version WHERE schema='lastlocalsync'");
	});
	this.__defineSetter__("lastLocalSyncTime", function (val) {
		Zotero.DB.query("REPLACE INTO version VALUES ('lastlocalsync', ?)", { int: val });
	});
	
	this.nextLocalSyncDate = false;
	this.apiVersion = 4;
	
	default xml namespace = '';
	
	var _loginManagerHost = 'chrome://zotero';
	var _loginManagerURL = 'Zotero Sync Server';
	
	var _serverURL = ZOTERO_CONFIG.SYNC_URL;
	
	var _apiVersionComponent = "version=" + this.apiVersion;
	var _cachedCredentials = {};
	var _syncInProgress;
	var _sessionID;
	var _sessionLock;
	var _throttleTimeout;
	
	function login(callback, callbackCallback) {
		var url = _serverURL + "login";
		
		var username = Zotero.Sync.Server.username;
		
		if (!username) {
			_error("Username not set in Zotero.Sync.Server.login()");
		}
		else if (!username.match(/^[\w\d\. ]+$/)) {
			_error("Invalid username '" + username + "' in Zotero.Sync.Server.login()");
		}
		
		username = encodeURIComponent(Zotero.Sync.Server.username);
		var password = encodeURIComponent(Zotero.Sync.Server.password);
		var body = _apiVersionComponent
					+ "&username=" + username
					+ "&password=" + password;
		
		Zotero.Utilities.HTTP.doPost(url, body, function (xmlhttp) {
			_checkResponse(xmlhttp);
			
			var response = xmlhttp.responseXML.childNodes[0];
			
			if (response.firstChild.tagName == 'error') {
				if (response.firstChild.getAttribute('type') == 'forbidden'
						&& response.firstChild.getAttribute('code') == 'INVALID_LOGIN') {
					_error('Invalid login/pass');
				}
				_error(response.firstChild.firstChild.nodeValue);
			}
			
			if (_sessionID) {
				_error("Session ID already set in Zotero.Sync.Server.login()")
			}
			
			// <response><sessionID>[abcdefg0-9]{32}</sessionID></response>
			_sessionID = response.firstChild.firstChild.nodeValue;
			
			var re = /^[abcdefg0-9]{32}$/;
			if (!re.test(_sessionID)) {
				_sessionID = null;
				_error('Invalid session ID received from server');
			}
			
			
			//Zotero.debug('Got session ID ' + _sessionID + ' from server');
			
			if (callback) {
				callback(callbackCallback);
			}
		});
	}
	
	
	function sync(callback) {
		Zotero.Sync.Runner.setSyncIcon('animate');
		
		if (!_sessionID) {
			Zotero.debug("Session ID not available -- logging in");
			Zotero.Sync.Server.login(Zotero.Sync.Server.sync, callback);
			return;
		}
		
		if (!_sessionLock) {
			Zotero.Sync.Server.lock(Zotero.Sync.Server.sync, callback);
			return;
		}
		
		if (_syncInProgress) {
			_error("Sync operation already in progress");
		}
		
		Zotero.debug("Beginning server sync");
		_syncInProgress = true;
		
		// Get updated data
		var url = _serverURL + 'updated';
		var lastsync = Zotero.Sync.Server.lastRemoteSyncTime;
		// TODO: use full sync instead? or make this full sync?
		if (!lastsync) {
			lastsync = 1;
		}
		var body = _apiVersionComponent
					+ '&' + Zotero.Sync.Server.sessionIDComponent
					+ '&lastsync=' + lastsync;
		
		Zotero.Utilities.HTTP.doPost(url, body, function (xmlhttp) {
			Zotero.debug(xmlhttp.responseText);
			
			_checkResponse(xmlhttp);
			if (_invalidSession(xmlhttp)) {
				Zotero.debug("Invalid session ID -- logging in");
				_sessionID = false;
				_syncInProgress = false;
				Zotero.Sync.Server.login(Zotero.Sync.Server.sync, callback);
				return;
			}
			
			var response = xmlhttp.responseXML.childNodes[0];
			
			if (response.firstChild.tagName == 'error') {
				// handle error
				_error(response.firstChild.firstChild.nodeValue);
			}
			
			// Strip XML declaration and convert to E4X
			var xml = new XML(xmlhttp.responseText.replace(/<\?xml.*\?>/, ''));
			
			Zotero.DB.beginTransaction();
			
			try {
				Zotero.UnresponsiveScriptIndicator.disable();
				
				var earliestRemoteDate = parseInt(xml.@earliest) ?
					new Date((xml.@earliest + 43200) * 1000) : false;
				
				var lastLocalSyncTime = Zotero.Sync.Server.lastLocalSyncTime;
				var lastLocalSyncDate = lastLocalSyncTime ?
					new Date(lastLocalSyncTime * 1000) : false;
				
				var syncSession = new Zotero.Sync.Server.Session;
				// Fetch old objects not on server (due to a clear) and new
				// objects added since last sync
				if (earliestRemoteDate && lastLocalSyncDate) {
					syncSession.uploadIDs.updated = Zotero.Sync.getObjectsByDate(
						earliestRemoteDate, lastLocalSyncDate
					);
				}
				// Fetch all local objects
				else {
					syncSession.uploadIDs.updated = Zotero.Sync.getObjectsByDate();
				}
				
				var deleted = Zotero.Sync.getDeletedObjects(lastLocalSyncDate);
				if (deleted == -1) {
					_error('Sync delete log starts after last sync date in Zotero.Sync.Server.sync()');
				}
				if (deleted) {
					syncSession.uploadIDs.deleted = deleted;
				}
				
				var nextLocalSyncDate = Zotero.DB.transactionDate;
				var nextLocalSyncTime = Zotero.Date.toUnixTimestamp(nextLocalSyncDate);
				Zotero.Sync.Server.nextLocalSyncDate = nextLocalSyncDate;
				
				// Reconcile and save updated data from server and
				// prepare local data to upload
				var xmlstr = Zotero.Sync.Server.Data.processUpdatedXML(
					xml.updated, lastLocalSyncDate, syncSession
				);
				
				//Zotero.debug(xmlstr);
				//throw('break');
				
				if (xmlstr === false) {
					Zotero.debug("Sync cancelled");
					Zotero.DB.rollbackTransaction();
					Zotero.Sync.Server.unlock(function () {
						if (callback) {
							Zotero.Sync.Runner.setSyncIcon();
							callback();
						}
						else { 
							Zotero.Sync.Runner.reset();
							Zotero.Sync.Runner.next();
						}
					});
					Zotero.reloadDataObjects();
					_syncInProgress = false;
					return;
				}
				
				if (xmlstr) {
					Zotero.debug(xmlstr);
				}
				
				Zotero.Sync.Server.lastRemoteSyncTime = response.getAttribute('timestamp');
				
				if (!xmlstr) {
					Zotero.debug("Nothing to upload to server");
					Zotero.Sync.Server.lastLocalSyncTime = nextLocalSyncTime;
					Zotero.Sync.Server.nextLocalSyncDate = false;
					Zotero.DB.commitTransaction();
					Zotero.Sync.Server.unlock(function () {
						_syncInProgress = false;
						if (callback) {
							Zotero.Sync.Runner.setSyncIcon();
							callback();
						}
						else {
							Zotero.Sync.Runner.next();
						}
					});
					return;
				}
				
				Zotero.DB.commitTransaction();
				
				var url = _serverURL + 'upload';
				var body = _apiVersionComponent
							+ '&' + Zotero.Sync.Server.sessionIDComponent
							+ '&data=' + encodeURIComponent(xmlstr);
				
				//var file = Zotero.getZoteroDirectory();
				//file.append('lastupload.txt');
				//Zotero.File.putContents(file, body);
				
				var uploadCallback = function (xmlhttp) {
					_checkResponse(xmlhttp);
					
					//var ZU = new Zotero.Utilities;
					//Zotero.debug(ZU.unescapeHTML(xmlhttp.responseText));
					Zotero.debug(xmlhttp.responseText);
					
					var response = xmlhttp.responseXML.childNodes[0];
					
					if (response.firstChild.tagName == 'error') {
						// handle error
						_error(response.firstChild.firstChild.nodeValue);
					}
					
					Zotero.DB.beginTransaction();
					Zotero.Sync.purgeDeletedObjects(nextLocalSyncTime);
					Zotero.Sync.Server.lastLocalSyncTime = nextLocalSyncTime;
					Zotero.Sync.Server.nextLocalSyncDate = false;
					Zotero.Sync.Server.lastRemoteSyncTime = response.getAttribute('timestamp');
					
					//throw('break2');
					
					Zotero.DB.commitTransaction();
					Zotero.Sync.Server.unlock(function () {
						_syncInProgress = false;
						if (callback) {
							Zotero.Sync.Runner.setSyncIcon();
							callback();
						}
						else {
							Zotero.Sync.Runner.next();
						}
					});
				}
				
				var compress = Zotero.Prefs.get('sync.server.compressData');
				// Compress upload data
				if (compress) {
					// Callback when compressed data is available
					var bufferUploader = function (data) {
						var gzurl = url + '?gzip=1';
						
						var oldLen = body.length;
						var newLen = data.length;
						var savings = Math.round(((oldLen - newLen) / oldLen) * 100)
						Zotero.debug("HTTP POST " + newLen + " bytes to " + gzurl
							+ " (gzipped from " + oldLen + " bytes; "
							+ savings + "% savings)");
						
						if (Zotero.Utilities.HTTP.browserIsOffline()) {
							Zotero.debug('Browser is offline');
							return false;
						}
						
						var req =
							Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"].
								createInstance();
						req.open('POST', gzurl, true);
						req.setRequestHeader('Content-Type', "application/octet-stream");
						req.setRequestHeader('Content-Encoding', 'gzip');
						
						req.onreadystatechange = function () {
							if (req.readyState == 4) {
								uploadCallback(req);
							}
						};
						try {
							req.sendAsBinary(data);
						}
						catch (e) {
							_error(e);
						}
					}
					
					// Get input stream from POST data
					var unicodeConverter =
						Components.classes["@mozilla.org/intl/scriptableunicodeconverter"]
							.createInstance(Components.interfaces.nsIScriptableUnicodeConverter);
					unicodeConverter.charset = "UTF-8";
					var bodyStream = unicodeConverter.convertToInputStream(body);
					
					// Get listener for when compression is done
					var listener = new Zotero.BufferedInputListener(bufferUploader);
					
					// Initialize stream converter
					var converter =
						Components.classes["@mozilla.org/streamconv;1?from=uncompressed&to=gzip"]
							.createInstance(Components.interfaces.nsIStreamConverter);
					converter.asyncConvertData("uncompressed", "gzip", listener, null);
					
					// Send input stream to stream converter
					var pump = Components.classes["@mozilla.org/network/input-stream-pump;1"].
							createInstance(Components.interfaces.nsIInputStreamPump);
					pump.init(bodyStream, -1, -1, 0, 0, true);
					pump.asyncRead(converter, null);
				}
				
				// Don't compress upload data
				else {
					Zotero.Utilities.HTTP.doPost(url, body, uploadCallback);
				}
			}
			catch (e) {
				_error(e);
			}
			finally {
				Zotero.UnresponsiveScriptIndicator.enable();
			}
		});
		
		return;
	}
	
	
	function lock(callback, callbackCallback) {
		Zotero.debug("Getting session lock");
		
		if (!_sessionID) {
			_error('No session available in Zotero.Sync.Server.lock()', 2);
		}
		
		if (_sessionLock) {
			_error('Session already locked in Zotero.Sync.Server.lock()', 2);
		}
		
		var url = _serverURL + "lock";
		var body = _apiVersionComponent
					+ '&' + Zotero.Sync.Server.sessionIDComponent;
		
		Zotero.Utilities.HTTP.doPost(url, body, function (xmlhttp) {
			if (_invalidSession(xmlhttp)) {
				Zotero.debug("Invalid session ID -- logging in");
				_sessionID = false;
				Zotero.Sync.Server.login(callback);
				return;
			}
			
			_checkResponse(xmlhttp);
			
			Zotero.debug(xmlhttp.responseText);
			
			var response = xmlhttp.responseXML.childNodes[0];
			
			if (response.firstChild.tagName == 'error') {
				if (_checkServerSessionLock(response.firstChild)) {
					Zotero.Sync.Server.lock(function () {
						if (callback) {
							callback(callbackCallback);
						}
					});
					return;
				}
				
				_error(response.firstChild.firstChild.nodeValue);
			}
			
			if (response.firstChild.tagName != 'locked') {
				_error('Invalid response from server', xmlhttp.responseText);
			}
			
			_sessionLock = true;
			
			if (callback) {
				callback(callbackCallback);
			}
		});
	}
	
	
	function unlock(callback) {
		Zotero.debug("Releasing session lock");
		
		if (!_sessionID) {
			_error('No session available in Zotero.Sync.Server.unlock()');
		}
		
		var syncInProgress = _syncInProgress;
		
		var url = _serverURL + "unlock";
		var body = _apiVersionComponent
					+ '&' + Zotero.Sync.Server.sessionIDComponent;
		
		Zotero.Utilities.HTTP.doPost(url, body, function (xmlhttp) {
			_checkResponse(xmlhttp);
			
			Zotero.debug(xmlhttp.responseText);
			
			var response = xmlhttp.responseXML.childNodes[0];
			
			if (response.firstChild.tagName == 'error') {
				_sessionLock = null;
				_error(response.firstChild.firstChild.nodeValue);
			}
			
			if (response.firstChild.tagName != 'unlocked') {
				_sessionLock = null;
				_error('Invalid response from server', xmlhttp.responseText);
			}
			
			_sessionLock = null;
			
			if (callback) {
				callback();
			}
		});
	}
	
	
	function clear(callback) {
		if (!_sessionID) {
			Zotero.debug("Session ID not available -- logging in");
			Zotero.Sync.Server.login(Zotero.Sync.Server.clear, callback);
			return;
		}
		
		var url = _serverURL + "clear";
		var body = _apiVersionComponent
					+ '&' + Zotero.Sync.Server.sessionIDComponent;
		
		Zotero.Utilities.HTTP.doPost(url, body, function (xmlhttp) {
			if (_invalidSession(xmlhttp)) {
				Zotero.debug("Invalid session ID -- logging in");
				_sessionID = false;
				Zotero.Sync.Server.login(Zotero.Sync.Server.clear, callback);
				return;
			}
			
			_checkResponse(xmlhttp);
			
			var response = xmlhttp.responseXML.childNodes[0];
			
			if (response.firstChild.tagName == 'error') {
				_error(response.firstChild.firstChild.nodeValue);
			}
			
			if (response.firstChild.tagName != 'cleared') {
				_error('Invalid response from server', xmlhttp.responseText);
			}
			
			Zotero.Sync.Server.resetClient();
			
			if (callback) {
				callback();
			}
		});
	}
	
	
	/**
	 * Clear session lock on server
	 */
	function resetServer(callback) {
		if (!_sessionID) {
			Zotero.debug("Session ID not available -- logging in");
			Zotero.Sync.Server.login(Zotero.Sync.Server.resetServer, callback);
			return;
		}
		
		var url = _serverURL + "reset";
		var body = _apiVersionComponent
					+ '&' + Zotero.Sync.Server.sessionIDComponent;
		
		Zotero.Utilities.HTTP.doPost(url, body, function (xmlhttp) {
			if (_invalidSession(xmlhttp)) {
				Zotero.debug("Invalid session ID -- logging in");
				_sessionID = false;
				Zotero.Sync.Server.login(Zotero.Sync.Server.reset, callback);
				return;
			}
			
			_checkResponse(xmlhttp);
			
			Zotero.debug(xmlhttp.responseText);
			
			var response = xmlhttp.responseXML.childNodes[0];
			
			if (response.firstChild.tagName == 'error') {
				_error(response.firstChild.firstChild.nodeValue);
			}
			
			if (response.firstChild.tagName != 'reset') {
				_error('Invalid response from server', xmlhttp.responseText);
			}
			
			_syncInProgress = false;
			
			if (callback) {
				callback();
			}
		});
	}
	
	
	function resetClient() {
		Zotero.DB.beginTransaction();
		
		var sql = "DELETE FROM version WHERE schema IN "
			+ "('lastlocalsync', 'lastremotesync', 'syncdeletelog')";
		Zotero.DB.query(sql);
		
		Zotero.DB.query("DELETE FROM syncDeleteLog");
		Zotero.DB.query("DELETE FROM storageDeleteLog");
		
		sql = "INSERT INTO version VALUES ('syncdeletelog', ?)";
		Zotero.DB.query(sql, Zotero.Date.getUnixTimestamp());
		
		Zotero.DB.commitTransaction();
	}
	
	
	function logout(callback) {
		var url = _serverURL + "logout";
		var body = _apiVersionComponent
					+ '&' + Zotero.Sync.Server.sessionIDComponent;
		
		_sessionID = null;
		
		Zotero.Utilities.HTTP.doPost(url, body, function (xmlhttp) {
			_checkResponse(xmlhttp);
			Zotero.debug(xmlhttp.responseText);
			
			var response = xmlhttp.responseXML.childNodes[0];
			
			if (response.firstChild.tagName == 'error') {
				_error(response.firstChild.firstChild.nodeValue);
			}
			
			if (response.firstChild.tagName != 'loggedout') {
				_error('Invalid response from server', xmlhttp.responseText);
			}
			
			if (callback) {
				callback();
			}
		});
	}
	
	
	function _checkResponse(xmlhttp) {
		if (!xmlhttp.responseText) {
			_error('Empty response from server');
		}
		
		if (!xmlhttp.responseXML || !xmlhttp.responseXML.childNodes[0] ||
				xmlhttp.responseXML.childNodes[0].tagName != 'response' ||
				!xmlhttp.responseXML.childNodes[0].firstChild) {
			Zotero.debug(xmlhttp.responseText);
			_error('Invalid response from server', xmlhttp.responseText);
		}
		
		// Temporarily disable auto-sync if instructed by server
		if (xmlhttp.responseXML.firstChild.firstChild.localName == 'throttle') {
			Zotero.debug(xmlhttp.responseText);
			var delay = xmlhttp.responseXML.firstChild.firstChild.getAttribute('delay');
			var time = new Date();
			time = time.getTime() + (delay * 1000);
			time = new Date(time);
			_throttleTimeout = time;
			if (delay < 86400000) {
				var timeStr = time.toLocaleTimeString();
			}
			else {
				var timeStr = time.toLocaleString();
			}
			// TODO: localize
			_error("Auto-syncing disabled until " + timeStr);
		}
	}
	
	
	function _checkServerSessionLock(errorNode, callback) {
		var code = errorNode.getAttribute('code');
		if (code != 'SYNC_IN_PROGRESS') {
			return false;
		}
		var lastAccessTime = errorNode.getAttribute('lastAccessTime');
		var ipAddress = errorNode.getAttribute('ipAddress');
		
		var pr = Components.classes["@mozilla.org/network/default-prompt;1"]
					.createInstance(Components.interfaces.nsIPrompt);
		var buttonFlags = (pr.BUTTON_POS_0) * (pr.BUTTON_TITLE_IS_STRING)
		+ (pr.BUTTON_POS_1) * (pr.BUTTON_TITLE_CANCEL)
		+ pr.BUTTON_POS_1_DEFAULT;
		var index = pr.confirmEx(
			Zotero.getString('general.warning'),
			// TODO: localize
			"Another sync operation, started at " + lastAccessTime + " from "
			+ (ipAddress
				? "another IP address (" + ipAddress + ")"
				: "the current IP address")
			+ ", "
			+ "is still in progress. "
			+ "This may indicate an active sync "
			+ (ipAddress ? "from another computer " : "")
			+ "or may have been caused by an interrupted session."
			+ "\n\n"
			+ "Do you want to reset the existing session? You should only do so "
			+ "if you do not believe another sync process is currently running.",
			buttonFlags,
			"Reset Session",
			null, null, null, {}
			);
		
		if (index == 0) {
			// TODO: 
			Zotero.Sync.Server.resetServer(callback);
			return true;
		}
		
		return false;
	}
	
	
	function _invalidSession(xmlhttp) {
		if (xmlhttp.responseXML.childNodes[0].firstChild.tagName != 'error') {
			return false;
		}
		
		var code = xmlhttp.responseXML.childNodes[0].firstChild.getAttribute('code');
		return (code == 'INVALID_SESSION_ID') || (code == 'SESSION_TIMED_OUT');
	}
	
	
	function _error(e, extraInfo) {
		if (extraInfo) {
			// Server errors will generally be HTML
			extraInfo = Zotero.Utilities.prototype.unescapeHTML(extraInfo);
			Components.utils.reportError(extraInfo);
		}
		
		Zotero.debug(e, 1);
		
		_syncInProgress = false;
		Zotero.DB.rollbackAllTransactions();
		Zotero.reloadDataObjects();
		
		if (_sessionID && _sessionLock) {
			Zotero.Sync.Server.unlock()
		}
		
		Zotero.Sync.Runner.setError(e.message ? e.message : e);
		Zotero.Sync.Runner.reset();
		throw(e);
	}
}




Zotero.BufferedInputListener = function (callback) {
	this._callback = callback;
}

Zotero.BufferedInputListener.prototype = {
	binaryInputStream: null,
	size: 0,
	data: '',
	
	onStartRequest: function(request, context) {},
	
	onStopRequest: function(request, context, status) {
		this.binaryInputStream.close();
		delete this.binaryInputStream;
		
		this._callback(this.data);
	},
	
	onDataAvailable: function(request, context, inputStream, offset, count) {
		this.size += count;
		
		this.binaryInputStream = Components.classes["@mozilla.org/binaryinputstream;1"]
			.createInstance(Components.interfaces.nsIBinaryInputStream)
		this.binaryInputStream.setInputStream(inputStream);
		this.data += this.binaryInputStream.readBytes(this.binaryInputStream.available());
	},
	
	QueryInterface: function (iid) {
		if (iid.equals(Components.interfaces.nsISupports)
			   || iid.equals(Components.interfaces.nsIStreamListener)) {
			return this;
		}
		throw Components.results.NS_ERROR_NO_INTERFACE;
	}
}


/**
 * Stores information about a sync session
 *
 * @class
 * @property		{Object}		uploadIDs	IDs to be uploaded to server
 *
 * {
 *	updated: {
 *		items: [123, 234, 345, 456],
 *		creators: [321, 432, 543, 654]
 *	},
 *	changed: {
 *		items: {
 * 			1234: { oldID: 1234, newID: 5678 }, ...
 *		},
 *		creators: {
 *			1234: { oldID: 1234, newID: 5678 }, ...
 *		}
 *	},
 *	deleted: {
 *		items: [
 * 			'ABCD1234', 'BCDE2345', ...
 *		],
 *		creators: [
 * 			'ABCD1234', 'BCDE2345', ...
 *		]
 * 	}
 * };
 */
Zotero.Sync.Server.Session = function () {
	this.uploadIDs = {};
	this.uploadIDs.updated = {};
	this.uploadIDs.changed = {};
	this.uploadIDs.deleted = {};
	
	for each(var syncObject in Zotero.Sync.syncObjects) {
		var types = syncObject.plural.toLowerCase(); // 'items'
		
		this.uploadIDs.updated[types] = [];
		this.uploadIDs.changed[types] = {};
		this.uploadIDs.deleted[types] = [];
	}
}


Zotero.Sync.Server.Session.prototype.addToUpdated = function (syncObjectTypeName, ids) {
	var pluralType = Zotero.Sync.syncObjects[syncObjectTypeName].plural.toLowerCase();
	var updated = this.uploadIDs.updated[pluralType];
	
	ids = Zotero.flattenArguments(ids);
	for each(var id in ids) {
		if (updated.indexOf(id) == -1) {
			updated.push(id);
		}
	}
}


Zotero.Sync.Server.Session.prototype.removeFromUpdated = function (syncObjectTypeName, ids) {
	var pluralType = Zotero.Sync.syncObjects[syncObjectTypeName].plural.toLowerCase();
	var updated = this.uploadIDs.updated[pluralType];
	
	ids = Zotero.flattenArguments(ids);
	var index;
	for each(var id in ids) {
		index = updated.indexOf(id);
		if (index != -1) {
			updated.splice(index, 1);
		}
	}
}


Zotero.Sync.Server.Session.prototype.addToDeleted = function (syncObjectTypeName, key) {
	var pluralType = Zotero.Sync.syncObjects[syncObjectTypeName].plural.toLowerCase();
	var deleted = this.uploadIDs.deleted[pluralType];
	if (deleted.indexOf(key) != -1) {
		return;
	}
	deleted.push(key);
}


Zotero.Sync.Server.Session.prototype.removeFromDeleted = function (syncObjectTypeName, key) {
	var pluralType = Zotero.Sync.syncObjects[syncObjectTypeName].plural.toLowerCase();
	var deleted = this.uploadIDs.deleted[pluralType];
	for (var i=0; i<deleted.length; i++) {
		if (deleted[i] == key) {
			deleted.splice(i, 1);
			i--;
		}
	}
}



Zotero.Sync.Server.Data = new function() {
	this.processUpdatedXML = processUpdatedXML;
	this.itemToXML = itemToXML;
	this.xmlToItem = xmlToItem;
	this.removeMissingRelatedItems = removeMissingRelatedItems;
	this.collectionToXML = collectionToXML;
	this.xmlToCollection = xmlToCollection;
	this.creatorToXML = creatorToXML;
	this.xmlToCreator = xmlToCreator;
	this.searchToXML = searchToXML;
	this.xmlToSearch = xmlToSearch;
	this.tagToXML = tagToXML;
	this.xmlToTag = xmlToTag;
	
	var _noMergeTypes = ['search'];
	
	default xml namespace = '';
	
	
	/**
	 * Reorder XML nodes for parent/child relationships, etc.
	 *
	 * @param {E4X}	xml
	 */
	function _preprocessUpdatedXML(xml) {
		if (xml.collections.length()) {
			var collections = xml.collections.children();
			var orderedCollections = <collections/>;
			var collectionIDHash = {};
			
			for (var i=0; i<collections.length(); i++) {
				// Build a hash of all collection ids
				collectionIDHash[collections[i].@id.toString()] = true;
				
				// Pull out top-level collections
				if (!collections[i].@parent.toString()) {
					orderedCollections.collection += collections[i];
					delete collections[i];
					i--;
				}
			}
			
			// Pull out all collections pointing to parents that
			// aren't present, which we assume already exist
			for (var i=0; i<collections.length(); i++) {
				if (!collectionIDHash[collections[i].@parent]) {
					orderedCollections.collection += collections[i]
					delete collections[i];
					i--;
				}
			}
			
			// Insert children directly under parents
			for (var i=0; i<orderedCollections.children().length(); i++) {
				for (var j=0; j<collections.length(); j++) {
					if (collections[j].@parent.toString() ==
							orderedCollections.children()[i].@id.toString()) {
						// Make a clone of object, since otherwise
						// delete below erases inserted item as well
						// (which only seems to happen with
						// insertChildBefore(), not += above)
						var newChild = new XML(collections[j].toXMLString())
						
						// If last top-level, just append
						if (i == orderedCollections.children().length() - 1) {
							orderedCollections.appendChild(newChild);
						}
						else {
							orderedCollections.insertChildBefore(
								orderedCollections.children()[i+1],
								newChild
							);
						}
						delete collections[j];
						j--;
					}
				}
			}
			
			xml.collections = orderedCollections;
		}
		
		return xml;
	}
	
	
	/**
	 * Pull out collections from delete queue in XML
	 *
	 * @param	{XML}			xml
	 * @return	{String[]}					Array of collection keys
	 */
	function _getDeletedCollectionKeys(xml) {
		var keys = [];
		if (xml.deleted && xml.deleted.collections) {
			for each(var xmlNode in xml.deleted.collections.collection) {
				keys.push(xmlNode.@key.toString());
			}
		}
		return keys;
	}
	
	
	function processUpdatedXML(xml, lastLocalSyncDate, syncSession) {
		if (xml.children().length() == 0) {
			Zotero.debug('No changes received from server');
			return Zotero.Sync.Server.Data.buildUploadXML(syncSession);
		}
		
		Zotero.DB.beginTransaction();
		
		xml = _preprocessUpdatedXML(xml);
		var deletedCollectionKeys = _getDeletedCollectionKeys(xml);
		
		var remoteCreatorStore = {};
		var relatedItemsStore = {};
		var itemStorageModTimes = {};
		
		for each(var syncObject in Zotero.Sync.syncObjects) {
			var Type = syncObject.singular; // 'Item'
			var Types = syncObject.plural; // 'Items'
			var type = Type.toLowerCase(); // 'item'
			var types = Types.toLowerCase(); // 'items'
			
			if (!xml[types]) {
				continue;
			}
			
			var toSave = [];
			var toDelete = [];
			var toReconcile = [];
			
			//
			// Handle modified objects
			//
			Zotero.debug("Processing remotely changed " + types);
			
			typeloop:
			for each(var xmlNode in xml[types][type]) {
				Zotero.debug("Processing remote " + type + " " + xmlNode.@id, 4);
				var isNewObject;
				var localDelete = false;
				
				// Get local object with same id
				var obj = Zotero[Types].get(parseInt(xmlNode.@id));
				if (obj) {
					// Key match -- same item
					if (obj.key == xmlNode.@key.toString()) {
						Zotero.debug("Matching local " + type + " exists", 4);
						isNewObject = false;
						
						var objDate = Zotero.Date.sqlToDate(obj.dateModified, true);
						
						// Local object has been modified since last sync
						if ((objDate > lastLocalSyncDate &&
									objDate < Zotero.Sync.Server.nextLocalSyncDate)
								// Check for object in updated array, since it might
								// have been modified during sync process, making its
								// date equal to Zotero.Sync.Server.nextLocalSyncDate
								// and therefore excluded above (example: an item
								// linked to a creator whose id changed)
								|| syncSession.uploadIDs.updated[types].indexOf(obj.id) != -1) {
							
							Zotero.debug("Local " + type + " " + obj.id
									+ " has been modified since last sync", 4);
							
							// Merge and store related items, since CR doesn't
							// affect related items
							if (type == 'item') {
								// Remote
								var related = xmlNode.related.toString();
								related = related ? related.split(' ') : [];
								// Local
								for each(var relID in obj.relatedItems) {
									if (related.indexOf(relID) == -1) {
										related.push(relID);
									}
								}
								if (related.length) {
									relatedItemsStore[obj.id] = related;
								}
								Zotero.Sync.Server.Data.removeMissingRelatedItems(xmlNode);
							}
							
							var remoteObj = Zotero.Sync.Server.Data['xmlTo' + Type](xmlNode);
							
							// Some types we don't bother to reconcile
							if (_noMergeTypes.indexOf(type) != -1) {
								// If local is newer, send to server
								if (obj.dateModified > remoteObj.dateModified) {
									syncSession.addToUpdated(type, obj.id);
									continue;
								}
								
								// Overwrite local below
							}
							// Mark other types for conflict resolution
							else {
								var reconcile = false;
								
								// Skip item if dateModified is the only modified
								// field (and no linked creators changed)
								switch (type) {
									// Will be handled by item CR for now
									case 'creator':
										remoteCreatorStore[remoteObj.id] = remoteObj;
										syncSession.removeFromUpdated(type, obj.id);
										continue;
										
									case 'item':
										var diff = obj.diff(remoteObj, false, true);
										if (!diff) {
											// Check if creators changed
											var creatorsChanged = false;
											
											var creators = obj.getCreators();
											var remoteCreators = remoteObj.getCreators();
											
											if (creators.length != remoteCreators.length) {
												creatorsChanged = true;
											}
											else {
												creators = creators.concat(remoteCreators);
												for each(var creator in creators) {
													var r = remoteCreatorStore[creator.ref.id];
													// Doesn't include dateModified
													if (r && !r.equals(creator.ref)) {
														creatorsChanged = true;
														break;
													}
												}
											}
											if (!creatorsChanged) {
												syncSession.removeFromUpdated(type, obj.id);
												continue;
											}
										}
										
										reconcile = true;
										break;
									
									case 'collection':
										var changed = _mergeCollection(obj, remoteObj);
										if (!changed) {
											syncSession.removeFromUpdated(type, obj.id);
										}
										continue;
									
									case 'tag':
										var changed = _mergeTag(obj, remoteObj);
										if (!changed) {
											syncSession.removeFromUpdated(type, obj.id);
										}
										continue;
								}
								
								if (!reconcile) {
									Zotero.debug(obj);
									Zotero.debug(remoteObj);
									var msg = "Reconciliation unimplemented for " + types;
									alert(msg);
									throw(msg);
								}
								
								// TODO: order reconcile by parent/child?
								
								toReconcile.push([
									obj,
									remoteObj
								]);
								
								continue;
							}
						}
						else {
							Zotero.debug("Local " + type + " has not changed", 4);
						}
						
						// Overwrite local below
					}
					
					// Key mismatch -- different objects with same id,
					// so change id of local object
					else {
						Zotero.debug("Local " + type + " " + xmlNode.@id + " differs from remote", 4);
						
						isNewObject = true;
						
						var oldID = parseInt(xmlNode.@id);
						var newID = Zotero.ID.get(types, true);
						
						Zotero.debug("Changing " + type + " " + oldID + " id to " + newID);
						
						// Save changed object now to update other linked objects
						obj[type + 'ID'] = newID;
						obj.save();
						
						// Update id in local updates array
						//
						// Object might not appear in local update array if server
						// data was cleared and synched from another client
						var index = syncSession.uploadIDs.updated[types].indexOf(oldID);
						if (index != -1) {
							syncSession.uploadIDs.updated[types][index] = newID;
						}
						
						// Add items linked to creators to updated array,
						// since their timestamps will be set to the
						// transaction timestamp
						//
						// Note: Don't need to change collection children or
						// related items, since they're stored as objects
						if (type == 'creator') {
							var linkedItems = obj.getLinkedItems();
							if (linkedItems) {
								syncSession.addToUpdated('item', linkedItems);
							}
						}
						
						syncSession.uploadIDs.changed[types][oldID] = {
							oldID: oldID,
							newID: newID
						};
						
						obj = null;
					}
				}
				
				// Object doesn't exist locally
				else {
					isNewObject = true;
					
					Zotero.debug(syncSession.uploadIDs.deleted);
					
					// Check if object has been deleted locally
					for each(var key in syncSession.uploadIDs.deleted[types]) {
						if (key != xmlNode.@key.toString()) {
							continue;
						}
						
						// TODO: non-merged items
						
						switch (type) {
							case 'item':
								localDelete = true;
								break;
							
							// Auto-restore locally deleted tags that have
							// changed remotely
							case 'tag':
								syncSession.removeFromDeleted(type, key);
								var msg = _generateAutoChangeMessage(
									type, null, xmlNode.@name.toString()
								);
								alert(msg);
								continue;
							
							default:
								alert('Delete reconciliation unimplemented for ' + types);
								throw ('Delete reconciliation unimplemented for ' + types);
						}
					}
					
					// If key already exists on a different item, change local key
					var oldKey = xmlNode.@key.toString();
					var keyObj = Zotero[Types].getByKey(oldKey);
					if (keyObj) {
						var newKey = Zotero.ID.getKey();
						Zotero.debug("Changing key of local " + type + " " + keyObj.id
							+ " from '" + oldKey + "' to '" + newKey + "'", 2);
						keyObj.key = newKey;
						keyObj.save();
						syncSession.addToUpdated(type, keyObj.id);
					}
				}
				
				// Temporarily remove and store related items that don't yet exist
				if (type == 'item') {
					var missing = Zotero.Sync.Server.Data.removeMissingRelatedItems(xmlNode);
					if (missing.length) {
						relatedItemsStore[xmlNode.@id] = missing;
					}
				}
				
				// Create or overwrite locally
				obj = Zotero.Sync.Server.Data['xmlTo' + Type](xmlNode, obj);
				
				if (isNewObject && type == 'tag') {
					// If a local tag matches the name of a different remote tag,
					// delete the local tag and add items linked to it to the
					// matching remote tag
					var tagName = xmlNode.@name.toString();
					var tagType = xmlNode.@type.toString()
									? parseInt(xmlNode.@type) : 0;
					var linkedItems = _deleteConflictingTag(syncSession, tagName, tagType);
					if (linkedItems) {
						var mod = false;
						for each(var id in linkedItems) {
							var added = obj.addItem(id);
							if (added) {
								mod = true;
							}
						}
						if (mod) {
							obj.dateModified = Zotero.DB.transactionDateTime;
							syncSession.addToUpdated('tag', parseInt(xmlNode.@id));
						}
					}
				}
				
				if (localDelete) {
					// TODO: order reconcile by parent/child?
					
					toReconcile.push([
						'deleted',
						obj
					]);
				}
				else {
					toSave.push(obj);
				}
				
				// Don't use assigned-but-unsaved ids for new ids
				Zotero.ID.skip(types, obj.id);
				
				if (type == 'item') {
					// Make sure none of the item's creators are marked as
					// deleted, which could happen if a creator was deleted
					// locally but attached to a new/modified item remotely
					// and added back in xmlToItem()
					if (obj.isRegularItem()) {
						var creators = obj.getCreators();
						for each(var creator in creators) {
							syncSession.removeFromDeleted('creator', creator.ref.key);
						}
					}
					else if (obj.isAttachment() &&
							(obj.attachmentLinkMode ==
								Zotero.Attachments.LINK_MODE_IMPORTED_FILE ||
							 obj.attachmentLinkMode ==
								Zotero.Attachments.LINK_MODE_IMPORTED_URL)) {
						// Mark new attachments for download
						if (isNewObject) {
							obj.attachmentSyncState =
								Zotero.Sync.Storage.SYNC_STATE_TO_DOWNLOAD;
						}
						// Set existing attachments mtime update check
						else {
							var mtime = xmlNode.@storageModTime.toString();
							if (mtime) {
								itemStorageModTimes[obj.id] = parseInt(mtime);
							}
						}
					}
				}
			}
			
			
			//
			// Handle remotely deleted objects
			//
			if (xml.deleted && xml.deleted[types]) {
				Zotero.debug("Processing remotely deleted " + types);
				
				for each(var xmlNode in xml.deleted[types][type]) {
					var key = xmlNode.@key.toString();
					var obj = Zotero[Types].getByKey(key);
					// Object can't be found
					if (!obj) {
						// Since it's already deleted remotely, don't include
						// the object in the deleted array if something else
						// caused its deletion during the sync
						syncSession.removeFromDeleted(type, xmlNode.@key.toString());
						continue;
					}
					
					var modDate = Zotero.Date.sqlToDate(obj.dateModified, true);
					
					// Local object hasn't been modified -- delete
					if (modDate < lastLocalSyncDate) {
						toDelete.push(obj.id);
						continue;
					}
					
					// Local object has been modified since last sync -- reconcile
					switch (type) {
						case 'item':
							// TODO: order reconcile by parent/child
							toReconcile.push([obj, 'deleted']);
							break;
						
						case 'tag':
							var msg = _generateAutoChangeMessage(
								type, obj.name, null
							);
							alert(msg);
							continue;
							
						default:
							alert('Delete reconciliation unimplemented for ' + types);
							throw ('Delete reconciliation unimplemented for ' + types);
					}
				}
			}
			
			
			//
			// Reconcile objects that have changed locally and remotely
			//
			if (toReconcile.length) {
				if (Zotero.Sync.Runner.background) {
					Zotero.debug("Background sync resulted in conflict -- aborting");
					Zotero.DB.rollbackTransaction();
					return false;
				}
				
				var mergeData = _reconcile(type, toReconcile, remoteCreatorStore);
				if (!mergeData) {
					// TODO: throw?
					Zotero.DB.rollbackTransaction();
					return false;
				}
				_processMergeData(
					syncSession,
					type,
					mergeData,
					toSave,
					toDelete,
					relatedItemsStore
				);
			}
			
			/*
			if (type == 'collection') {
				// Temporarily remove and store subcollections before saving
				// since referenced collections may not exist yet
				var collections = [];
				for each(var obj in toSave) {
					var colIDs = obj.getChildCollections(true);
					// TODO: use exist(), like related items above
					obj.childCollections = [];
					collections.push({
						obj: obj,
						childCollections: colIDs
					});
				}
			}
			*/
			
			// Save objects
			Zotero.debug('Saving merged ' + types);
			// Save parent items first
			if (type == 'item') {
				for (var i=0; i<toSave.length; i++) {
					if (!toSave[i].getSource()) {
						toSave[i].save();
						toSave.splice(i, 1);
						i--;
					}
				}
			}
			for each(var obj in toSave) {
				// Use a special saving mode for tags to avoid an issue that
				// occurs if a tag has changed names remotely but another tag
				// conflicts with the local version after the first tag has been
				// updated in memory, causing a deletion of the local tag.
				// Using the normal save mode, when the first remote tag then
				// goes to save, the linked items aren't saved, since as far
				// as the in-memory object is concerned, they haven't changed,
				// even though they've been deleted from the DB.
				//
				// To replicate, add an item, add a tag, sync both sides,
				// rename the tag, add a new one with the old name, and sync.
				var full = type == 'tag';
				
				obj.save(full);
			}
			
			// Add back related items (which now exist)
			if (type == 'item') {
				for (var itemID in relatedItemsStore) {
					item = Zotero.Items.get(itemID);
					for each(var id in relatedItemsStore[itemID]) {
						item.addRelatedItem(id);
					}
					item.save();
				}
			}
			/*
			// Add back subcollections
			else if (type == 'collection') {
				for each(var collection in collections) {
					if (collection.childCollections.length) {
						collection.obj.childCollections = collection.childCollections;
						collection.obj.save();
					}
				}
			}
			*/
			
			
			// Delete
			Zotero.debug('Deleting merged ' + types);
			if (toDelete.length) {
				// Items have to be deleted children-first
				if (type == 'item') {
					var parents = [];
					var children = [];
					for each(var id in toDelete) {
						var item = Zotero.Items.get(id);
						if (item.getSource()) {
							children.push(item.id);
						}
						else {
							parents.push(item.id);
						}
					}
					
					// Lock dateModified in local versions of remotely deleted
					// collections so that any deleted items within them don't
					// update them, which would trigger erroneous conflicts
					var collections = [];
					for each(var colKey in deletedCollectionKeys) {
						var col = Zotero.Collections.getByKey(colKey);
						// If collection never existed on this side
						if (!col) {
							continue;
						}
						col.lockDateModified();
						collections.push(col);
					}
					
					if (children.length) {
						Zotero.Sync.EventListener.ignoreDeletions('item', children);
						Zotero.Items.erase(children);
						Zotero.Sync.EventListener.unignoreDeletions('item', children);
					}
					if (parents.length) {
						Zotero.Sync.EventListener.ignoreDeletions('item', parents);
						Zotero.Items.erase(parents);
						Zotero.Sync.EventListener.unignoreDeletions('item', parents);
					}
					
					// Unlock dateModified for deleted collections
					for each(var col in collections) {
						col.unlockDateModified();
					}
					collection = null;
				}
				else {
					Zotero.Sync.EventListener.ignoreDeletions(type, toDelete);
					Zotero[Types].erase(toDelete);
					Zotero.Sync.EventListener.unignoreDeletions(type, toDelete);
				}
			}
			
			// Check mod times of updated items against stored time to see
			// if they've been updated elsewhere and mark for download if so
			if (type == 'item') {
				var ids = [];
				for (var id in itemStorageModTimes) {
					ids.push(id);
				}
				if (ids.length > 0) {
					Zotero.Sync.Storage.checkForUpdatedFiles(ids, itemStorageModTimes);
				}
			}
		}
		
		var xmlstr = Zotero.Sync.Server.Data.buildUploadXML(syncSession);
		
		//Zotero.debug(xmlstr);
		//throw ('break');
		
		Zotero.DB.commitTransaction();
		
		return xmlstr;
	}
	
	
	/**
	 * @param	{Zotero.Sync.Server.Session}		syncSession
	 */
	this.buildUploadXML = function (syncSession) {
		var ids = syncSession.uploadIDs;
		
		var xml = <data/>
		
		// Add API version attribute
		xml.@version = Zotero.Sync.Server.apiVersion;
		
		
		// Updates
		for each(var syncObject in Zotero.Sync.syncObjects) {
			var Type = syncObject.singular; // 'Item'
			var Types = syncObject.plural; // 'Items'
			var type = Type.toLowerCase(); // 'item'
			var types = Types.toLowerCase(); // 'items'
			
			if (!ids.updated[types] || !ids.updated[types].length) {
				continue;
			}
			
			Zotero.debug("Processing locally changed " + types);
			
			switch (type) {
				// Items.get() can take multiple ids,
				// so we handle them differently
				case 'item':
					var objs = Zotero[Types].get(ids.updated[types]);
					xml.items = <items/>;
					for each(var obj in objs) {
						//xml[types][type] += this[type + 'ToXML'](obj, syncSession);
						xml[types].appendChild(this[type + 'ToXML'](obj, syncSession));
					}
					break;
					
				default:
					xml[types] = new XML("<" + types + "/>");
					for each(var id in ids.updated[types]) {
						var obj = Zotero[Types].get(id);
						//xml[types][type] += this[type + 'ToXML'](obj);
						xml[types].appendChild(this[type + 'ToXML'](obj));
					}
			}
		}
		
		// TODO: handle changed ids
		
		// Deletions
		for each(var syncObject in Zotero.Sync.syncObjects) {
			var Type = syncObject.singular; // 'Item'
			var Types = syncObject.plural; // 'Items'
			var type = Type.toLowerCase(); // 'item'
			var types = Types.toLowerCase(); // 'items'
			
			if (!ids.deleted[types] || !ids.deleted[types].length) {
				continue;
			}
			
			Zotero.debug('Processing locally deleted ' + types);
			
			for each(var key in ids.deleted[types]) {
				var deletexml = new XML('<' + type + '/>');
				deletexml.@key = key;
				xml.deleted[types][type] += deletexml;
			}
		}
		
		var xmlstr = xml.toXMLString();
		if (xmlstr.match('<data version="[0-9]+"/>')) {
			return '';
		}
		
		return xmlstr;
	}
	
	
	function _mergeCollection(localObj, remoteObj) {
		var diff = localObj.diff(remoteObj, false, true);
		if (!diff) {
			return false;
		}
		
		Zotero.debug("COLLECTION HAS CHANGED");
		Zotero.debug(diff);
		
		// Local is newer
		if (diff[0].primary.dateModified >
				diff[1].primary.dateModified) {
			var remoteIsTarget = false;
			var targetObj = localObj;
			var targetDiff = diff[0];
			var otherDiff = diff[1];
		}
		// Remote is newer
		else {
			var remoteIsTarget = true;
			var targetObj = remoteObj;
			var targetDiff = diff[1];
			var otherDiff = diff[0];
		}
		
		if (targetDiff.fields.name) {
			var msg = _generateAutoChangeMessage(
				'collection', diff[0].fields.name, diff[1].fields.name, remoteIsTarget
			);
			// TODO: log rather than alert
			alert(msg);
		}
		
		// Check for child collections in the other object
		// that aren't in the target one
		if (otherDiff.childCollections.length) {
			// TODO: log
			// TODO: add
			throw ("Collection hierarchy conflict resolution is unimplemented");
		}
		
		// Add items in other object to target one
		if (otherDiff.childItems.length) {
			var childItems = targetObj.getChildItems(true);
			targetObj.childItems = childItems.concat(otherDiff.childItems);
			
			var msg = _generateCollectionItemMergeMessage(
				targetObj.name,
				otherDiff.childItems,
				remoteIsTarget
			);
			// TODO: log rather than alert
			alert(msg);
		}
		
		targetObj.save();
		return true;
	}
	
	
	function _mergeTag(localObj, remoteObj) {
		var diff = localObj.diff(remoteObj, false, true);
		if (!diff) {
			return false;
		}
		
		Zotero.debug("TAG HAS CHANGED");
		Zotero.debug(diff);
		
		// Local is newer
		if (diff[0].primary.dateModified >
				diff[1].primary.dateModified) {
			var remoteIsTarget = false;
			var targetObj = localObj;
			var targetDiff = diff[0];
			var otherDiff = diff[1];
		}
		// Remote is newer
		else {
			var remoteIsTarget = true;
			var targetObj = remoteObj;
			var targetDiff = diff[1];
			var otherDiff = diff[0];
		}
		
		// TODO: log old name
		if (targetDiff.fields.name) {
			var msg = _generateAutoChangeMessage(
				'tag', diff[0].fields.name, diff[1].fields.name, remoteIsTarget
			);
			alert(msg);
		}
		
		// Add linked items in the other object to the target one
		if (otherDiff.linkedItems.length) {
			// need to handle changed items
			
			var linkedItems = targetObj.getLinkedItems(true);
			targetObj.linkedItems = linkedItems.concat(otherDiff.linkedItems);
			
			var msg = _generateTagItemMergeMessage(
				targetObj.name,
				otherDiff.linkedItems,
				remoteIsTarget
			);
			// TODO: log rather than alert
			alert(msg);
		}
		
		targetObj.save();
		return true;
	}
	
	
	/**
	 * @param	{String}	itemType
	 * @param	{String}	localName
	 * @param	{String}	remoteName
	 * @param	{Boolean}	[remoteMoreRecent=false]
	 */
	function _generateAutoChangeMessage(itemType, localName, remoteName, remoteMoreRecent) {
		if (localName === null) {
			// TODO: localize
			localName = "[deleted]";
			var localDelete = true;
		}
		else if (remoteName === null) {
			remoteName = "[deleted]";
			var remoteDelete = true;
		}
		
		// TODO: localize
		var msg = "A " + itemType + " has changed both locally and "
			+ "remotely since the last sync:";
		msg += "\n\n";
		msg += "Local version: " + localName + "\n";
		msg += "Remote version: " + remoteName + "\n";
		msg += "\n";
		if (localDelete) {
			msg += "The remote version has been kept.";
		}
		else if (remoteDelete) {
			msg += "The local version has been kept.";
		}
		else {
			var moreRecent = remoteMoreRecent ? remoteName : localName;
			msg += "The most recent version, '" + moreRecent + "', has been kept.";
		}
		return msg;
	}
	
	
	/**
	 * @param	{String}		collectionName
	 * @param	{Integer[]}		addedItemIDs
	 * @param	{Boolean}		remoteIsTarget
	 */
	function _generateCollectionItemMergeMessage(collectionName, addedItemIDs, remoteIsTarget) {
		// TODO: localize
		var introMsg = "Items in the collection '" + collectionName + "' have been "
			+ "added and/or removed in multiple locations."
		
		introMsg += " ";
		if (remoteIsTarget) {
			introMsg += "The following items have been added to the remote collection:";
		}
		else {
			introMsg += "The following items have been added to the local collection:";
		}
		var itemText = [];
		for each(var id in addedItemIDs) {
			var item = Zotero.Items.get(id);
			var title = item.getField('title');
			var text = " - " + title;
			var firstCreator = item.getField('firstCreator');
			if (firstCreator) {
				text += " (" + firstCreator + ")";
			}
			itemText.push(text);
		}
		return introMsg + "\n\n" + itemText.join("\n");
	}
	
	
	/**
	 * @param	{String}		tagName
	 * @param	{Integer[]}		addedItemIDs
	 * @param	{Boolean}		remoteIsTarget
	 */
	function _generateTagItemMergeMessage(tagName, addedItemIDs, remoteIsTarget) {
		// TODO: localize
		var introMsg = "The tag '" + tagName + "' has been "
			+ "added to and/or removed from items in multiple locations."
		
		introMsg += " ";
		if (remoteIsTarget) {
			introMsg += "It has been added to the following remote items:";
		}
		else {
			introMsg += "It has been added to the following local items:";
		}
		var itemText = [];
		for each(var id in addedItemIDs) {
			var item = Zotero.Items.get(id);
			var title = item.getField('title');
			var text = " - " + title;
			var firstCreator = item.getField('firstCreator');
			if (firstCreator) {
				text += " (" + firstCreator + ")";
			}
			itemText.push(text);
		}
		return introMsg + "\n\n" + itemText.join("\n");
	}
	
	
	/**
	 * Open a conflict resolution window and return the results
	 *
	 * @param	{String}		type			'item', 'collection', etc.
	 * @param	{Array[]}	objectPairs	Array of arrays of pairs of Item, Collection, etc.
	 */
	function _reconcile(type, objectPairs, changedCreators) {
		var io = {
			dataIn: {
				type: type,
				captions: [
					// TODO: localize
					'Local Object',
					'Remote Object',
					'Merged Object'
				],
				objects: objectPairs
			}
		};
		
		if (type == 'item') {
			if (!Zotero.Utilities.prototype.isEmpty(changedCreators)) {
				io.dataIn.changedCreators = changedCreators;
			}
		}
		
		var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
				   .getService(Components.interfaces.nsIWindowMediator);
		var lastWin = wm.getMostRecentWindow("navigator:browser");
		lastWin.openDialog('chrome://zotero/content/merge.xul', '', 'chrome,modal,centerscreen', io);
		
		return io.dataOut;
	}
	
	
	/**
	 * Process the results of conflict resolution
	 */
	function _processMergeData(syncSession, type, data, toSave, toDelete, relatedItems) {
		var types = Zotero.Sync.syncObjects[type].plural.toLowerCase();
		
		for each(var obj in data) {
			// TODO: do we need to make sure item isn't already being saved?
			
			// Handle items deleted during merge
			if (obj.ref == 'deleted') {
				// Deleted item was remote
				if (obj.left != 'deleted') {
					toDelete.push(obj.id);
					
					if (relatedItems[obj.id]) {
						delete relatedItems[obj.id];
					}
					
					syncSession.addToDeleted(type, obj.left.key);
				}
				continue;
			}
			
			toSave.push(obj.ref);
			
			// Don't use assigned-but-unsaved ids for new ids
			Zotero.ID.skip(types, obj.id);
			
			// Item had been deleted locally, so remove from
			// deleted array
			if (obj.left == 'deleted') {
				syncSession.removeFromDeleted(type, obj.ref.key);
			}
			
			// TODO: only upload if the local item was chosen
			// or remote item was changed
			
			syncSession.addToUpdated(type, obj.id);
		}
	}
	
	
	/**
	 * Converts a Zotero.Item object to an E4X <item> object
	 *
	 * @param	{Zotero.Item}					item
	 * @param	{Zotero.Sync.Server.Session}		[syncSession]
	 */
	function itemToXML(item, syncSession) {
		var xml = <item/>;
		var item = item.serialize();
		
		// Primary fields
		for (var field in item.primary) {
			switch (field) {
				case 'itemID':
					var attr = 'id';
					break;
					
				default:
					var attr = field;
			}
			xml['@' + attr] = item.primary[field];
		}
		
		// Item data
		for (var field in item.fields) {
			if (!item.fields[field]) {
				continue;
			}
			var newField = <field>{_xmlize(item.fields[field])}</field>;
			newField.@name = field;
			xml.field += newField;
		}
		
		// Deleted item flag
		if (item.deleted) {
			xml.@deleted = '1';
		}
		
		if (item.primary.itemType == 'note' || item.primary.itemType == 'attachment') {
			if (item.sourceItemID) {
				xml.@sourceItemID = item.sourceItemID;
			}
		}
		
		// Note
		if (item.primary.itemType == 'note') {
			var note = <note>{_xmlize(item.note)}</note>;
			xml.note += note;
		}
		
		// Attachment
		if (item.primary.itemType == 'attachment') {
			xml.@linkMode = item.attachment.linkMode;
			xml.@mimeType = item.attachment.mimeType;
			var charset = item.attachment.charset;
			if (charset) {
				xml.@charset = charset;
			}
			
			// Include storage sync time and paths for non-links
			if (item.attachment.linkMode != Zotero.Attachments.LINK_MODE_LINKED_URL) {
				var mtime = Zotero.Sync.Storage.getSyncedModificationTime(item.primary.itemID);
				if (mtime) {
					xml.@storageModTime = mtime;
				}
				
				var path = <path>{item.attachment.path}</path>;
				xml.path += path;
			}
			
			if (item.note) {
				var note = <note>{_xmlize(item.note)}</note>;
				xml.note += note;
			}
		}
		
		// Creators
		for (var index in item.creators) {
			var newCreator = <creator/>;
			var creatorID = item.creators[index].creatorID;
			newCreator.@id = creatorID;
			newCreator.@creatorType = item.creators[index].creatorType;
			newCreator.@index = index;
			
			// Add creator XML as glue if not already included in sync session
			if (syncSession &&
					syncSession.uploadIDs.updated.creators.indexOf(creatorID) == -1) {
				var creator = Zotero.Creators.get(creatorID);
				var creatorXML = Zotero.Sync.Server.Data.creatorToXML(creator);
				newCreator.creator = creatorXML;
			}
			
			xml.creator += newCreator;
		}
		
		// Related items
		if (item.related.length) {
			xml.related = item.related.join(' ');
		}
		
		return xml;
	}
	
	
	/**
	 * Convert E4X <item> object into an unsaved Zotero.Item
	 *
	 * @param	object	xmlItem		E4X XML node with item data
	 * @param	object	item			(Optional) Existing Zotero.Item to update
	 * @param	bool	skipPrimary		(Optional) Ignore passed primary fields (except itemTypeID)
	 */
	function xmlToItem(xmlItem, item, skipPrimary) {
		if (!item) {
			if (skipPrimary) {
				item = new Zotero.Item;
			}
			else {
				item = new Zotero.Item(parseInt(xmlItem.@id));
				/*
				if (item.exists()) {
					_error("Item specified in XML node already exists "
						+ "in Zotero.Sync.Server.Data.xmlToItem()");
				}
				*/
			}
		}
		else if (skipPrimary) {
			throw ("Cannot use skipPrimary with existing item in "
					+ "Zotero.Sync.Server.Data.xmlToItem()");
		}
		
		// TODO: add custom item types
		
		var data = {
			itemTypeID: Zotero.ItemTypes.getID(xmlItem.@itemType.toString())
		};
		if (!skipPrimary) {
			data.dateAdded = xmlItem.@dateAdded.toString();
			data.dateModified = xmlItem.@dateModified.toString();
			data.key = xmlItem.@key.toString();
		}
		
		var changedFields = {};
		
		// Primary data
		for (var field in data) {
			item.setField(field, data[field]);
			changedFields[field] = true;
		}
		
		// Item data
		for each(var field in xmlItem.field) {
			var fieldName = field.@name.toString();
			item.setField(fieldName, field.toString());
			changedFields[fieldName] = true;
		}
		var previousFields = item.getUsedFields(true);
		for each(var field in previousFields) {
			if (!changedFields[field] &&
					// If not valid, it'll already have been cleared by the
					// type change
					Zotero.ItemFields.isValidForType(
						Zotero.ItemFields.getID(field), data.itemTypeID
					)) {
				item.setField(field, false);
			}
		}
		
		// Deleted item flag
		var deleted = xmlItem.@deleted.toString();
		item.deleted = (deleted == 'true' || deleted == "1");
		
		// Item creators
		var i = 0;
		for each(var creator in xmlItem.creator) {
			var pos = parseInt(creator.@index);
			if (pos != i) {
				throw ('No creator in position ' + i);
			}
			
			var creatorID = parseInt(creator.@id);
			var creatorObj = Zotero.Creators.get(creatorID);
			// If creator doesn't exist locally (e.g., if it was deleted locally
			// and appears in a new/modified item remotely), get it from within
			// the item's creator block, where a copy should be provided
			if (!creatorObj) {
				if (creator.creator.length() == 0) {
					throw ("Data for missing local creator " + creatorID
						+ " not provided in Zotero.Sync.Server.Data.xmlToItem()");
				}
				var creatorObj =
					Zotero.Sync.Server.Data.xmlToCreator(creator.creator);
				if (creatorObj.id != creatorID) {
					throw ("Creator id " + creatorObj.id + " does not match "
						+ "item creator in Zotero.Sync.Server.Data.xmlToItem()");
				}
			}
			item.setCreator(
				pos,
				creatorObj,
				creator.@creatorType.toString()
			);
			i++;
		}
		
		// Remove item's remaining creators not in XML
		var numCreators = item.numCreators();
		var rem = numCreators - i;
		for (var j=0; j<rem; j++) {
			// Keep removing last creator
			item.removeCreator(i);
		}
		
		// Both notes and attachments might have parents and notes
		if (item.isNote() || item.isAttachment()) {
			var sourceItemID = parseInt(xmlItem.@sourceItemID);
			item.setSource(sourceItemID ? sourceItemID : false);
			item.setNote(xmlItem.note.toString());
		}
		
		// Attachment metadata
		if (item.isAttachment()) {
			item.attachmentLinkMode = parseInt(xmlItem.@linkMode);
			item.attachmentMIMEType = xmlItem.@mimeType.toString();
			item.attachmentCharset = xmlItem.@charset.toString();
			if (item.attachmentLinkMode != Zotero.Attachments.LINK_MODE_LINKED_URL) { 
				item.attachmentPath = xmlItem.path.toString();
			}
		}
		
		// Related items
		var related = xmlItem.related.toString();
		item.relatedItems = related ? related.split(' ') : [];
		
		return item;
	}
	
	
	function removeMissingRelatedItems(xmlNode) {
		var missing = [];
		var related = xmlNode.related.toString();
		var relIDs = related ? related.split(' ') : [];
		if (relIDs.length) {
			var exist = Zotero.Items.exist(relIDs);
			for each(var id in relIDs) {
				if (exist.indexOf(id) == -1) {
					missing.push(id);
				}
			}
			xmlNode.related = exist.join(' ');
		}
		return missing;
	}
	
	
	function collectionToXML(collection) {
		var xml = <collection/>;
		
		xml.@id = collection.id;
		xml.@name = _xmlize(collection.name);
		xml.@dateAdded = collection.dateAdded;
		xml.@dateModified = collection.dateModified;
		xml.@key = collection.key;
		if (collection.parent) {
			xml.@parent = collection.parent;
		}
		
		var children = collection.getChildren();
		if (children) {
			//xml.collections = '';
			xml.items = '';
			for each(var child in children) {
				/*
				if (child.type == 'collection') {
					xml.collections = xml.collections ?
						xml.collections + ' ' + child.id : child.id;
				}
				else */if (child.type == 'item') {
					xml.items = xml.items ?
						xml.items + ' ' + child.id : child.id;
				}
			}
			/*
			if (xml.collections == '') {
				delete xml.collections;
			}
			*/
			if (xml.items == '') {
				delete xml.items;
			}
		}
		
		return xml;
	}
	
	
	/**
	 * Convert E4X <collection> object into an unsaved Zotero.Collection
	 *
	 * @param	object	xmlCollection	E4X XML node with collection data
	 * @param	object	item		(Optional) Existing Zotero.Collection to update
	 * @param	bool	skipPrimary		(Optional) Ignore passed primary fields (except itemTypeID)
	 */
	function xmlToCollection(xmlCollection, collection, skipPrimary) {
		if (!collection) {
			if (skipPrimary) {
				collection = new Zotero.Collection(null);
			}
			else {
				collection = new Zotero.Collection(parseInt(xmlCollection.@id));
				/*
				if (collection.exists()) {
					throw ("Collection specified in XML node already exists "
						+ "in Zotero.Sync.Server.Data.xmlToCollection()");
				}
				*/
			}
		}
		else if (skipPrimary) {
			throw ("Cannot use skipPrimary with existing collection in "
					+ "Zotero.Sync.Server.Data.xmlToCollection()");
		}
		
		collection.name = xmlCollection.@name.toString();
		if (!skipPrimary) {
			collection.parent = xmlCollection.@parent.toString() ?
				parseInt(xmlCollection.@parent) : null;
			collection.dateAdded = xmlCollection.@dateAdded.toString();
			collection.dateModified = xmlCollection.@dateModified.toString();
			collection.key = xmlCollection.@key.toString();
		}
		
		/*
		// Subcollections
		var str = xmlCollection.collections.toString();
		collection.childCollections = str == '' ? [] : str.split(' ');
		*/
		
		// Child items
		var str = xmlCollection.items.toString();
		collection.childItems = str == '' ? [] : str.split(' ');
		
		return collection;
	}
	
	
	/**
	 * Converts a Zotero.Creator object to an E4X <creator> object
	 */
	function creatorToXML(creator) {
		var xml = <creator/>;
		var creator = creator.serialize();
		for (var field in creator.primary) {
			switch (field) {
				case 'creatorID':
					var attr = 'id';
					break;
					
				default:
					var attr = field;
			}
			xml['@' + attr] = creator.primary[field];
		}
		
		var allowEmpty = ['firstName', 'lastName', 'name'];
		
		for (var field in creator.fields) {
			if (!creator.fields[field] && allowEmpty.indexOf(field) == -1) {
				continue;
			}
			
			switch (field) {
				case 'firstName':
				case 'lastName':
				case 'name':
					xml[field] = _xmlize(creator.fields[field]);
					break;
				
				default:
					xml[field] = creator.fields[field];
			}
		}
		return xml;
	}
	
	
	/**
	 * Convert E4X <creator> object into an unsaved Zotero.Creator
	 *
	 * @param	object	xmlCreator	E4X XML node with creator data
	 * @param	object	item		(Optional) Existing Zotero.Creator to update
	 * @param	bool	skipPrimary	(Optional) Ignore passed primary fields (except itemTypeID)
	 */
	function xmlToCreator(xmlCreator, creator, skipPrimary) {
		if (!creator) {
			if (skipPrimary) {
				creator = new Zotero.Creator;
			}
			else {
				creator = new Zotero.Creator(parseInt(xmlCreator.@id));
				/*
				if (creator.exists()) {
					throw ("Creator specified in XML node already exists "
						+ "in Zotero.Sync.Server.Data.xmlToCreator()");
				}
				*/
			}
		}
		else if (skipPrimary) {
			throw ("Cannot use skipPrimary with existing creator in "
					+ "Zotero.Sync.Server.Data.xmlToCreator()");
		}
		
		var data = {
			birthYear: xmlCreator.birthYear.toString()
		};
		if (!skipPrimary) {
			data.dateAdded = xmlCreator.@dateAdded.toString();
			data.dateModified = xmlCreator.@dateModified.toString();
			data.key = xmlCreator.@key.toString();
		}
		
		if (xmlCreator.fieldMode == 1) {
			data.firstName = '';
			data.lastName = xmlCreator.name.toString();
			data.fieldMode = 1;
		}
		else {
			data.firstName = xmlCreator.firstName.toString();
			data.lastName = xmlCreator.lastName.toString();
			data.fieldMode = 0;
		}
		
		creator.setFields(data);
		
		return creator;
	}
	
	
	function searchToXML(search) {
		var xml = <search/>;
		
		xml.@id = search.id;
		xml.@name = _xmlize(search.name);
		xml.@dateAdded = search.dateAdded;
		xml.@dateModified = search.dateModified;
		xml.@key = search.key;
		
		var conditions = search.getSearchConditions();
		if (conditions) {
			for each(var condition in conditions) {
				var conditionXML = <condition/>
				conditionXML.@id = condition.id;
				conditionXML.@condition = condition.condition;
				if (condition.mode) {
					conditionXML.@mode = condition.mode;
				}
				conditionXML.@operator = condition.operator;
				conditionXML.@value =
					_xmlize(condition.value ? condition.value : '');
				if (condition.required) {
					conditionXML.@required = 1;
				}
				xml.condition += conditionXML;
			}
		}
		
		return xml;
	}
	
	
	/**
	 * Convert E4X <search> object into an unsaved Zotero.Search
	 *
	 * @param	object	xmlSearch	E4X XML node with search data
	 * @param	object	item		(Optional) Existing Zotero.Search to update
	 * @param	bool	skipPrimary		(Optional) Ignore passed primary fields (except itemTypeID)
	 */
	function xmlToSearch(xmlSearch, search, skipPrimary) {
		if (!search) {
			if (skipPrimary) {
				search = new Zotero.Search(null);
			}
			else {
				search = new Zotero.Search(parseInt(xmlSearch.@id));
				/*
				if (search.exists()) {
					throw ("Search specified in XML node already exists "
						+ "in Zotero.Sync.Server.Data.xmlToSearch()");
				}
				*/
			}
		}
		else if (skipPrimary) {
			throw ("Cannot use new id with existing search in "
					+ "Zotero.Sync.Server.Data.xmlToSearch()");
		}
		
		search.name = xmlSearch.@name.toString();
		if (!skipPrimary) {
			search.dateAdded = xmlSearch.@dateAdded.toString();
			search.dateModified = xmlSearch.@dateModified.toString();
			search.key = xmlSearch.@key.toString();
		}
		
		var conditionID = -1;
		
		// Search conditions
		for each(var condition in xmlSearch.condition) {
			conditionID = parseInt(condition.@id);
			var name = condition.@condition.toString();
			var mode = condition.@mode.toString();
			if (mode) {
				name = name + '/' + mode;
			}
			if (search.getSearchCondition(conditionID)) {
				search.updateCondition(
					conditionID,
					name,
					condition.@operator.toString(),
					condition.@value.toString(),
					!!condition.@required.toString()
				);
			}
			else {
				var newID = search.addCondition(
					name,
					condition.@operator.toString(),
					condition.@value.toString(),
					!!condition.@required.toString()
				);
				if (newID != conditionID) {
					throw ("Search condition ids not contiguous in Zotero.Sync.Server.xmlToSearch()");
				}
			}
		}
		
		conditionID++;
		while (search.getSearchCondition(conditionID)) {
			search.removeCondition(conditionID);
		}
		
		return search;
	}
	
	
	function tagToXML(tag) {
		var xml = <tag/>;
		
		xml.@id = tag.id;
		xml.@name = _xmlize(tag.name);
		if (tag.type) {
			xml.@type = tag.type;
		}
		xml.@dateAdded = tag.dateAdded;
		xml.@dateModified = tag.dateModified;
		xml.@key = tag.key;
		var linkedItems = tag.getLinkedItems(true);
		if (linkedItems) {
			xml.items = linkedItems.join(' ');
		}
		return xml;
	}
	
	
	/**
	 * Convert E4X <tag> object into an unsaved Zotero.Tag
	 *
	 * @param	object	xmlTag			E4X XML node with tag data
	 * @param	object	tag				(Optional) Existing Zotero.Tag to update
	 * @param	bool	skipPrimary		(Optional) Ignore passed primary fields
	 */
	function xmlToTag(xmlTag, tag, skipPrimary) {
		if (!tag) {
			if (skipPrimary) {
				tag = new Zotero.Tag;
			}
			else {
				tag = new Zotero.Tag(parseInt(xmlTag.@id));
				/*
				if (tag.exists()) {
					throw ("Tag specified in XML node already exists "
						+ "in Zotero.Sync.Server.Data.xmlToTag()");
				}
				*/
			}
		}
		else if (skipPrimary) {
			throw ("Cannot use new id with existing tag in "
					+ "Zotero.Sync.Server.Data.xmlToTag()");
		}
		
		tag.name = xmlTag.@name.toString();
		tag.type = xmlTag.@type.toString() ? parseInt(xmlTag.@type) : 0;
		if (!skipPrimary) {
			tag.dateAdded = xmlTag.@dateAdded.toString();
			tag.dateModified = xmlTag.@dateModified.toString();
			tag.key = xmlTag.@key.toString();
		}
		
		var str = xmlTag.items ? xmlTag.items.toString() : false;
		tag.linkedItems = str ? str.split(' ') : [];
		
		return tag;
	}
	
	
	/**
	 * @param	{String}		name		Tag name
	 * @param	{Integer}	type		Tag type
	 * @return	{Integer[]|FALSE}	Array of itemIDs of items linked to
	 *									deleted tag, or FALSE if no
	 *									matching tag found
	 */
	function _deleteConflictingTag(syncSession, name, type) {
		var tagID = Zotero.Tags.getID(name, type);
		if (tagID) {
			Zotero.debug("Deleting conflicting local tag " + tagID);
			var tag = Zotero.Tags.get(tagID);
			var linkedItems = tag.getLinkedItems(true);
			Zotero.Tags.erase(tagID);
			Zotero.Tags.purge();
			
			syncSession.removeFromUpdated('tag', tagID);
			//syncSession.addToDeleted('tag', tag.key);
			
			return linkedItems ? linkedItems : [];
		}
		
		return false;
	}
	
	
	function _xmlize(str) {
		return str.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ud800-\udfff\ufffe\uffff]/g, '\u2B1A');
	}
}
