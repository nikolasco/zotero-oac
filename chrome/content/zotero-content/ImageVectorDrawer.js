var drawer;
function build(mode, scale, old) {
    drawer = new VectorDrawer(mode, scale, old, $("#to-mark"));
}

function savable() {
    return drawer.savable();
}

function scale(s) {
    drawer.scale(s);
}

function mode(m) {
    drawer.drawMode(m);
}
