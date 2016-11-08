$(document).ready(function() {

  $.ajax({
    url: "http://pelasne-nginx-east.eastus.cloudapp.azure.com:81/name",
    success: function(response) {
      $("#name").text(response.name);
    },
    error: function(xhr, status, error) {
      $("#name").text(xhr.statusText);
    }
  });

});
