$(document).ready(function() {

  $.ajax({
    url: "/name",
    success: function(response) {
      $("#name").text(response.name);
    },
    error: function(xhr, status, error) {
      $("#name").text(xhr.statusText);
    }
  });

});
