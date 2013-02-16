$(function () {
  $('#quote').focus();
  $("#names").autocomplete({
    source: "/names",
    delay: 0
  });
})