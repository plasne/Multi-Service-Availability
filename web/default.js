
function refresh() {

    $.ajax({
        url: "/all",
        success: function(all) {

            // clear
            $("body").html("");

            $(all.regions).each(function(_, region) {

                // region
                var region_div = $("<div></div>").appendTo("body").addClass("region");
                $("<h1></h1>").appendTo(region_div).text(region.name);

                // instances
                if (region.instances.length > 0) {
                    $("<h4></h4>").appendTo(region_div).text("instances");
                    var table = $("<table></table>").appendTo(region_div);
                    var thead = $("<thead></thead>").appendTo(table);
                    var thead_tr = $("<tr></tr>").appendTo(thead);
                    $("<td></td>").appendTo(thead_tr).text("name");
                    $("<td></td>").appendTo(thead_tr).text("role");
                    $("<td></td>").appendTo(thead_tr).text("connected?");
                    var tbody = $("<tbody></tbody>").appendTo(table);
                    $(region.instances).each(function(_, instance) {
                        var tr = $("<tr></td>").appendTo(tbody);
                        var name_td = $("<td></td>").appendTo(tr);
                        $("<a></a>").appendTo(name_td).text(instance.name).attr({
                            href: instance.url
                        });
                        $("<td></td>").appendTo(tr).text( (instance.isMaster) ? "master" : "slave" );
                        var connected_td = $("<td></td>").appendTo(tr);
                        var connected_div = $("<div></div>").appendTo(connected_td).text(instance.isConnected).addClass("centered");
                        if (instance.isConnected === true) {
                            connected_div.addClass("good");
                        } else if (instance.isConnected === false) {
                            connected_div.addClass("bad");
                        }
                    });
                }

                // services
                if (region.services.length > 0) {
                    $("<h4></h4>").appendTo(region_div).text("services");
                    var table = $("<table></table>").appendTo(region_div);
                    var thead = $("<thead></thead>").appendTo(table);
                    var thead_tr = $("<tr></tr>").appendTo(thead);
                    $("<td></td>").appendTo(thead_tr).text("name");
                    $("<td></td>").appendTo(thead_tr).text("state");
                    $("<td></td>").appendTo(thead_tr).text("report");
                    $("<td></td>").appendTo(thead_tr).text("properties");
                    var tbody = $("<tbody></tbody>").appendTo(table);
                    $(region.services).each(function(_, service) {
                        var tr = $("<tr></td>").appendTo(tbody);
                        var name_td = $("<td></td>").appendTo(tr);
                        if (service.url) {
                            $("<a></a>").appendTo(name_td).text(service.name).attr({
                                href: service.url,
                                target: "_blank"
                            });
                        } else {
                            name_td.text(service.name);
                        }
                        $("<td></td>").appendTo(tr).text(service.state);
                        var report_td = $("<td></td>").appendTo(tr);
                        var report_div = $("<div></div>").appendTo(report_td).text(service.report).addClass("centered");
                        if (service.report === "up") {
                            report_div.addClass("good");
                        } else if (service.report === "down") {
                            report_div.addClass("bad");
                        }
                        $("<td></td>").appendTo(tr).text(service.properties);
                    });
                }

            });

        },
        error: function(ex) {
            alert(ex);
        }
    });

}

$(document).ready(function() {

    setInterval(refresh, 500);

});