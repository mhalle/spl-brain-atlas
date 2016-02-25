var app = angular.module('myApp', [ 'ngSanitize', 'adaptv.adaptStrap' ]);
app.controller('myCtrl', function($scope, $http) {
    jQuery.ajax({
        dataType: "json",
        url: "../tsvToJson/atlasStructure.json",
        async: false,
        success: function (data) {
        var atlasStructure = data;
        var vtkDatasources = data.filter(function (object) { 
        return object['@type']==='datasource' && /\.vtk$/.test(object.source);
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


    //THREE.JS INIT
    var camera = new THREE.PerspectiveCamera( 60, window.innerWidth / window.innerHeight, 0.01, 1e10 );
    camera.position.z = 300;

    var controls = new THREE.TrackballControls( camera );

    controls.rotateSpeed = 5.0;
    controls.zoomSpeed = 5;
    controls.panSpeed = 2;

    controls.noZoom = false;
    controls.noPan = false;

    controls.staticMoving = true;
    controls.dynamicDampingFactor = 0.3;

    var scene = new THREE.Scene();

    scene.add( camera );

    // light

    var dirLight = new THREE.DirectionalLight( 0xffffff );
    dirLight.position.set( 200, 200, 1000 ).normalize();

    camera.add( dirLight );
    camera.add( dirLight.target );



    //Load all the vtk files
    var loader = new THREE.VTKLoader();
    var loadedFile = 0;
    var numberOfFilesToLoad = vtkStructures.length;

    //this function enables us to create a scope and then keep the right item in the callback
    function loadVTKFile (i) {
        var file = vtkStructures[i].sourceSelector.dataSourceObject.source;
        loader.load( file, function ( geometry ) {

            var item = vtkStructures[i];

            geometry.computeVertexNormals();

            var rgb = item.renderOptions.color.match(/^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,?\s*([.0-9]+)?\)$/);
            if (rgb) {
                rgb = rgb.map(Number);
            }
            else {
                console.log(JSON.stringify(item,null,4));
                rgb = [0,0,0,0];
            }

            var material = new THREE.MeshLambertMaterial({
                wireframe : false, 
                morphTargets : false, 
                side : THREE.DoubleSide, 
                color : rgb[1]*256*256+rgb[2]*256+rgb[3]
            });

            material.opacity = item.renderOptions.opacity || rgb[4] || 1.0;
            material.visible = true;

            if (material.opacity < 1) {
                material.transparent = true;
            }

            var mesh = new THREE.Mesh( geometry, material );
            item.mesh = mesh;

            loadedFile++;

            if (loadedFile === numberOfFilesToLoad) {
                createHierarchy();
            }

        } );
    }


    for (var i = 0; i<vtkStructures.length; i++) {
        loadVTKFile(i);
    }


    function getTreeObjectFromUuid (uuid) {
        var item = atlasStructure.find(x=>x['@id']===uuid);
        var treeObject = {
            name : item.annotation.name,
            mesh : item.mesh
        };
        if (item['@type']==='group') {
            treeObject.children = item.members.map(getTreeObjectFromUuid).filter(x => x.mesh !== undefined);
            treeObject.mesh = new THREE.Group();
            for (var i = 0; i< treeObject.children.length; i++) {
                try {
                    treeObject.mesh.add(treeObject.children[i].mesh);
                }
                catch (e) {
                    console.log(e);
                }
            }
        }
        return treeObject;
    }

    function createHierarchy () {
        var rootGroups = atlasStructure.filter(x => x['@type']==='group' && x.annotation && x.annotation.root);
        var hierarchyTree = {
            children : rootGroups.map(group => getTreeObjectFromUuid(group['@id']))
        };

        for(var i = 0; i<hierarchyTree.children.length; i++) {
            scene.add(hierarchyTree.children[i].mesh);
        }


        $scope.data = {
            root : hierarchyTree
        };

        var listContainer = document.getElementById('structureList');
        listContainer.innerHTML = `<ad-tree-browser class="ad-border-default"
tree-name="treeDemoBordered"
row-ng-class="{added:item._selected}"
tree-root="data.root"
child-node="children"
children-padding="15"
bordered="true"
node-template-url="treeNode.html">
</ad-tree-browser>`;

        console.log('end controller');
    }


    // renderer

    container = document.getElementById( 'rendererFrame' );
    renderer = new THREE.WebGLRenderer( { antialias: false } );
    renderer.setPixelRatio( window.devicePixelRatio );
    renderer.setSize( container.width, container.height );

    container.appendChild( renderer.domElement );

    stats = new Stats();
    stats.domElement.style.position = 'absolute';
    stats.domElement.style.top = '0px';
    container.appendChild( stats.domElement );

    function onWindowResize() {

        camera.aspect = container.width / container.height;
        camera.updateProjectionMatrix();

        renderer.setSize( container.width, container.height );

        controls.handleResize();

    }

    window.addEventListener( 'resize', onWindowResize, false );

    function animate() {

        requestAnimationFrame( animate );

        controls.update();
        renderer.render( scene, camera );

        stats.update();

    }

    animate();


}
               });
});