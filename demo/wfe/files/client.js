$(document).ready(function() {

  $.ajax({
    url: "http://pelasne-dmz-east.eastus.cloudapp.azure.com:81/name",
    success: function(response) {
      $("#name").text(response.name);
    },
    error: function(xhr, status, error) {
      $("#name").text(xhr.statusText);
    }
  });

});
