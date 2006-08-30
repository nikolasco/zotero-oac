/*
	Zotero
	Copyright (C) 2006   Center for History and New Media, George Mason University, Fairfax, VA
	http://chnm.gmu.edu/
*/

var autoUpdateBox;
var positionMenu;
var parseEndnoteBox;
var openURLMenu;
var openURLResolvers;
var openURLServerField;
var openURLVersionMenu;

/*
	To add a new preference:
		1) modify defaults/preferences/scholar.js
		2) in this document:
			a) add var above
			b) add lines to init() function
			c) add line to accept() function
		3) add a control to prefs.xul
		4) (Optional) To add an observer for a preference change,
			add an appropriate case in the switch statement
			in Scholar.Prefs.observe()
*/

function init()
{	
	autoUpdateBox = document.getElementById('autoUpdateBox');
	autoUpdateBox.checked = Scholar.Prefs.get('automaticScraperUpdates');
	
	positionMenu = document.getElementById('positionMenu');
	positionMenu.selectedIndex = Scholar.Prefs.get('scholarPaneOnTop') ? 0 : 1;
	
	parseEndnoteBox = document.getElementById('parseEndnoteBox');
	parseEndnoteBox.checked = Scholar.Prefs.get('parseEndNoteMIMETypes');
	
	openURLServerField = document.getElementById('openURLServerField');
	openURLServerField.value = Scholar.Prefs.get('openURL.resolver');
	openURLVersionMenu = document.getElementById('openURLVersionMenu');
	openURLVersionMenu.value = Scholar.Prefs.get('openURL.version');

	openURLMenu = document.getElementById('openURLMenu');

	openURLResolvers = Scholar.OpenURL.discoverResolvers();
	for(var i in openURLResolvers)
	{
		openURLMenu.insertItemAt(i,openURLResolvers[i]['name']);
		if(openURLResolvers[i]['url'] == Scholar.Prefs.get('openURL.resolver') && openURLResolvers[i]['version'] == Scholar.Prefs.get('openURL.version'))
			openURLMenu.selectedIndex = i;
	}
}

function accept()
{
	Scholar.Prefs.set('automaticScraperUpdates', autoUpdateBox.checked);
	Scholar.Prefs.set('scholarPaneOnTop', positionMenu.selectedIndex == 0);
	
	if(Scholar.Prefs.get('parseEndNoteMIMETypes') != parseEndnoteBox.checked)
	{
		Scholar.Prefs.set('parseEndNoteMIMETypes', parseEndnoteBox.checked);
		Scholar.Ingester.MIMEHandler.init();
	}
	
	Scholar.Prefs.set('openURL.resolver', openURLServerField.value);
	Scholar.Prefs.set('openURL.version', openURLVersionMenu.value);
}

function onOpenURLSelected()
{
	if(openURLMenu.value == "custom")
	{
		openURLServerField.focus();
	}
	else
	{
		openURLServerField.value = openURLResolvers[openURLMenu.selectedIndex]['url'];
		openURLVersionMenu.value = openURLResolvers[openURLMenu.selectedIndex]['version'];
	}
}

function onOpenURLCustomized()
{
	openURLMenu.value = "custom";
}