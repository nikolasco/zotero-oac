var p = document.getElementById('player');
var tm = null, ui = null, oldAnnos = null;

function build(old) {
    oldAnnos = old;
    setupTM();
}

function setupTM() {
    if (tm || !ui || oldAnnos === null) return;
    tm = new TimeMarker({
        container: $("#time-marker-container"),
        player: p,
        initState: oldAnnos,
        formatTime: function (t) {return ui.formatTime(t);}
    });
}

function savable() {
    return tm.savable();
}

function markNow() {
    tm.markNow();
}

function markStartEnd() {
    tm.markStartEnd();
}

var inited = false;

function amReady() {
    if (inited) return;
    inited = true;

    ui = new PlayerUI({container: $("#player-ui-container"), player: p});
    setupTM();
}

if (p.play) amReady();
