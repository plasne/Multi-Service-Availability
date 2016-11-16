$(document).ready(function() {

  $.ajax({
    url: "http://app/name",
    success: function(response) {
      $("#name").text(response.name);
    },
    error: function(xhr, status, error) {
      $("#name").text(xhr.statusText);
    }
  });

});
