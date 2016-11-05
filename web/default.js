
var url = "/all";

function refresh() {

    $.ajax({
        url: url,
        success: function(all) {

            // attached instance
            $("body").html("");
            $("<h1></h1>").appendTo("body").text(all.instance.name + " (" + all.instance.uuid + ")");

            // show all regions
            $(all.regions).each(function(_, region) {

                // region
                var region_div = $("<div></div>").appendTo("body").addClass("region");
                $("<h2></h2>").appendTo(region_div).text(region.name);

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
                        if (all.use_proxy) {
                            $("<a></a>").appendTo(name_td).text(instance.name).attr({
                                href: "#"
                            }).click(function() {
                                url = instance.url;
                            });
                        } else {
                            $("<a></a>").appendTo(name_td).text(instance.name).attr({
                                href: instance.url
                            });
                        }
                        var role_td = $("<td></td>").appendTo(tr).addClass("centered");
                        if (instance.isConnected === false) {
                            role_td.text("-");
                        } else if (instance.isMaster === true) {
                            role_td.text("master");
                        } else {
                            role_td.text("slave");
                        }
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
                        var state_td = $("<td></td>").appendTo(tr);
                        var state_div = $("<div></div>").appendTo(state_td).text( (service.state == "unknown") ? "-" : service.state ).addClass("centered");
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