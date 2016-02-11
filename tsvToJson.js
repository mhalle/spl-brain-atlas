var tsv = require('tsv').TSV; //npm install tsv
var fs = require('fs');

fs.readFile('labelinfo/brain-atlas-labels-with-metadata.tsv', 'utf-8', function (err, fileContent) {
    if (err) {
        console.log(err);
        return;
    }
    var parsedTSV = tsv.parse(fileContent).filter((e) => e.value !== ''); //for some reasons, some entries have an empty  value and should be removed

    var result = [];

    //----------------------------------------------- DEFINING HEADER -----------------------------------------------//
    var header = {
        "@type": "header",
        "species": "human",
        "organ": "brain",
        "name" : "SPL-PNL Brain Atlas",

        "license" : "?",
        "citation" : "?",
        "version" : "1",
        "contact" : "https://github.com/mhalle/spl-brain-atlas",
        "comment" : `The SPL-PNL Brain atlas is an automatic- and expert-segmented model of the human brain derived from data from a single normal subject.

The atlas has been processed and refined over many years by scores of physicians, researchers, and computer scientists from a variety of institutions, including the [Surgical Planning Lab](http://www.spl.harvard.edu) and the [Psychiatry Neuroimaging Lab](http://pnl.bwh.harvard.edu/) at [Brigham and Women's Hospital](http://brighamandwomens.org). The SPL-PNL Brain Atlas provides important reference information for surgical planning. It has been used for template-driven segmentation and also as a neuroanatomy teaching tool.

Over the years, the original atlas has undergone several revisions. The current version consists of:

* the original volumetric whole brain MRI of a healthy volunteer;
* a set of detailed label maps;
* 160+ three-dimensional models of the labeled anatomical structures;
* a mrml-file that allows loading all of the data into the 3DSlicer for visualization (see the tutorial associated with the atlas);
* several pre-defined 3D-views for the motor, visual and limbic systems, diencephalon, brain stem, and left cerebral hemisphere.`,
        "coordinate_system" : "self defined"
    };

    result.push(header);

    //-------------------------------------------- LOOKING FOR VTK FILES --------------------------------------------//

    fs.readdir('slicer/models', function (err, vtkFiles) {
        console.log(vtkFiles.length+" vtk files found");


        //----------------------------------- LOOP OVER ALL THE STRUCTURES IN TSV -----------------------------------//

        var numberOfDataSources = 0;
        var usedVTKFiles = [];
        var structuresWithoutVTKFile = [];
        
        for (var i = 1; i < parsedTSV.length; i++) {

            var structure = {
                "@id" : "structure"+i,
                "@type" : "structure",
                sourceSelector : {
                    dataKey : Number(parsedTSV[i].value)
                },
                annotation : {
                    name : parsedTSV[i].label,
                    radlexId : parsedTSV[i]['radlex_id'],
                    radlexStructureId : parsedTSV[i]['radlex_structure_id'],
                    notes : parsedTSV[i].notes
                },
                renderOptions : {
                    color : parsedTSV[i].color
                }
            };

            var fileNames = vtkFiles.filter((name) => name.includes('Model_'+parsedTSV[i].value+'_'));
            var fileName = fileNames.length > 0 ? fileNames[0] : null;
            
            if (fileNames.length > 1) {
                throw "Error : several vtk files match the same value";
            }
            
            //create data source only if the file exists
            if (fileName) {
                var dataSource = {
                    "@id" : "dataSource"+i,
                    "@type" : "datasource",
                    "mimeType" : "application/x-vtk",
                    "source" : "file://slicer/models/"+fileName
                };
                result.push(dataSource);
                usedVTKFiles.push(fileName);

                structure.sourceSelector.dataSource = dataSource["@id"];
                numberOfDataSources++;
            }
            else {
                structuresWithoutVTKFile.push(parsedTSV[i].label);
            }

            result.push(structure);
        }
        
        console.log(numberOfDataSources+" data source(s) created");
        console.log('useless vtk files : ', JSON.stringify(vtkFiles.filter((name) => usedVTKFiles.indexOf(name) === -1), null, 4));
        console.log(i+" structure(s) created");
        console.log('structures without vtk files : ', JSON.stringify(structuresWithoutVTKFile, null, 4));
        
        

        //-------------------------------------------- WRITING JSON FILE --------------------------------------------//

        fs.writeFile("atlasStructure.json", JSON.stringify(result, null, 4), function(err) {
            if(err) {
                return console.log(err);
            }

            console.log("The JSON file was saved!");
        }); 


    });

});