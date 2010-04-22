$("#mark-moment").click(function () {markNow();});
var mr = $("#mark-range");
mr.click(function () {markStartEnd();});
mr.toggle(
  function () {mr.text("...End range");},
  function () {mr.text("Start a range...");}
);


function changeNote(content, isRange, num){
	txt = content.firstChild.nodeValue;
	var cpn = $(content.parentNode);
	$(content.parentNode).html("<span><input type='text' onblur='recordNote(this,"+isRange+","+num+")' value='"+txt+"' size='20'/></span>");
	cpn[0].firstChild.firstChild.select();

	$(cpn[0].nextSibling.firstChild).html("<img alt='edit' src='chrome://zotero-content/skin/images/annotate-audio-save.png'>");



}
function recordNote(content, isRange, num ){
	txt = content.value;
	var cpn = $(content.parentNode);
	cpn.html("<span onmousedown='changeNote(this,"+isRange+","+num+")'>"+txt+"</span>");

	$(cpn[0].parentNode.nextSibling.firstChild).html("<img alt='edit' src='chrome://zotero-content/skin/annotate-audio-edit.png'>");

	cpn.trigger('saveNoteEvent',[isRange,num,txt]);
}
function deleteNote(content,isRange,num){
	// TODO: We'll want a prompt to ensure intent eventually - DLR
	var row = $(content.parentNode.parentNode);
	row.trigger('deleteNoteEvent',[isRange,num]);
	row[0].parentNode.removeChild(row[0]);

}

build([]);
