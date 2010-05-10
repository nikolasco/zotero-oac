function Note(old, pos) {
	this._cont = $("<div class=\"note-container\">" +
			"<div class=\"display\"></div>" +
			"<form class=\"edit\">" +
				"<textarea></textarea>" +
				"<div class=\"button-row\">" +
					"<input type=\"button\" value=\"Save\" class=\"save\" />" +
					"<input type=\"button\" value=\"Cancel\" class=\"cancel\" />" +
				"</div>" +
			"</form>" +
		"</div>");
	this._disp = $(".display", this._cont);
	this._edit = $(".edit", this._cont);
	this._area = $("textarea", this._cont);
	var save = $(".save", this._cont);
	var cancel = $(".cancel", this._cont);

	this._cont.appendTo(".vd-container");
	this._cont.css({left: pos.x, top: pos.y, position: "absolute"});
	this._disp.text(old || " ");
	this._area.val(old);

	var self = this;
	this._cont.mousedown(function (e) {e.stopPropagation();});
	this._cont.mouseup(function (e) {e.stopPropagation();});
	this._cont.keydown(function (e) {e.stopPropagation();});
	this._disp.click(function (e) {
		self._disp.css("display", "none");
		self._edit.css("display", "block");
		self._area.focus();
	});
	function awayEdit(e){
		self._disp.css("display", "block");
		self._edit.css("display", "none");
	};
	save.click(awayEdit);
	cancel.click(awayEdit);

	save.click(function (e) {
		self._disp.text(self._area.val() || " ");
		self._disp.focus();
	});
}

$.extend(Note.prototype, {
	close: function (){
		var ret = this._area.val();
		this._cont.remove();
		return ret;
	}
});

var drawer;
function build(mode, scale, old) {
	drawer = new VectorDrawer(mode, scale, old, $("#to-mark"), Note);
}

function savable() {
	return JSON.stringify(drawer.savable());
}

function scale(s) {
	drawer.scale(s);
}

function mode(m) {
	drawer.drawMode(m);
}
