$(document).ready(function() {

  $.ajax({
    url: "/app/name",
    success: function(response) {
      $("#name").text(response.name);
    },
    error: function(xhr, status, error) {
      $("#name").text(xhr.statusText);
    }
  });

});
