var app = angular.module('myApp', [ 'ngSanitize', 'adaptv.adaptStrap' ]);
app.controller('myCtrl', function($scope, $http) {
    jQuery.ajax({
        dataType: "json",
        url: "../tsvToJson/atlasStructure.json",
        async: false,
        success: function(data){
        var atlasStructure = data;
        var vtkDatasources = data.filter(function (object) {
        return object['@type']==='datasource' && /\.vtk$/.test(object.source)
    });
    var vtkDatasourcesId = vtkDatasources.map(source => source["@id"]);
    var vtkStructures = [];
    for(var i=0; i<atlasStructure.length; i++) {
        var item = atlasStructure[i];
        if (item['@type']==='structure') {
            var dataSourceIndex = vtkDatasourcesId.indexOf(item.sourceSelector.dataSource);
            if ( dataSourceIndex> -1) {
                //item refers to a vtk file
                item.sourceSelector.dataSourceObject = vtkDatasources[dataSourceIndex];
                vtkStructures.push(item);
            }
        }
    }
    //XTK
    renderer = new X.renderer3D();
    renderer.container = 'rendererFrame';
    renderer.init();


    for (var item of vtkStructures) {
        var mesh = new X.mesh();
        mesh.file = item.sourceSelector.dataSourceObject.source;
        var rgb = item.renderOptions.color.match(/^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,?\s*([.0-9]+)?\)$/);
        if (rgb) {
            rgb = rgb.map(Number);
        }
        else {
            console.log(JSON.stringify(item,null,4));
            continue;
        }
        mesh.color = [rgb[1]/255, rgb[2]/255, rgb[3]/255];
        mesh.opacity = item.renderOptions.opacity || rgb[4] || 1.0;
        mesh.visible = true;
        mesh.caption = item.annotation.name;
        item.mesh = mesh;
    }


    function getTreeObjectFromUuid (uuid) {
        var item = atlasStructure.find(x=>x['@id']===uuid);
        var treeObject = {
            name : item.annotation.name,
            mesh : item.mesh
        };
        if (item['@type']==='group') {
            treeObject.children = item.members.map(getTreeObjectFromUuid);
            treeObject.mesh = new X.object();
            for (var i = 0; i< treeObject.children.length; i++) {
                treeObject.mesh.children.push(treeObject.children[i].mesh);
            }
        }
        return treeObject;
    }

    var rootGroups = atlasStructure.filter(x => x['@type']==='group' && x.annotation && x.annotation.root);
    var hierarchyTree = {
        children : rootGroups.map(group => getTreeObjectFromUuid(group['@id']))
    };

    for(var i = 0; i<hierarchyTree.children.length; i++) {
        renderer.add(hierarchyTree.children[i].mesh);
    }
    renderer.camera.position =[-288, 68, 15];
    renderer.camera.up = [-0.01, 0.0, 1];
    renderer.render();

    $scope.data = {
        root : hierarchyTree
    };

    console.log('end controller');
}
               });
});