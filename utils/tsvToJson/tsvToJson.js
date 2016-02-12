//external module
var tsv = require('tsv').TSV;
var Parser = require('tsv').Parser;
var fs = require('fs');
var uuid = require ('uuid');
var nrrd = require('nrrd-js');
var ndarray = require('ndarray');
var zlib = require('zlib');
var chalk = require('chalk');

//defining chalk style
var errorLog = chalk.red.bold;
var successLog = chalk.green;
var warningLog = chalk.yellow;

//global vars
var nrrdConversion,
    nrrdParser,
    vtkConversion,
    vtkFiles,
    vtkAtlasTSV,
    colorCheck,
    writeJSONFile,
    hncma = {},
    skin = {},
    hncmaAtlasTSV,
    hncmaColorTable,
    JSONResult = [],
    initialDate = Date.now();

//------------------------------------------------- DEFINING HEADER -------------------------------------------------//
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
JSONResult.push(header);


//------------------------------------- LOOKING FOR BRAIN ATLAS TSV DESCRIPTION -------------------------------------//
fs.readFile('../../labelinfo/brain-atlas-labels-with-metadata.tsv', 'utf-8', function (err, fileContent) {
    if (err) {
        console.log(errorLog('Error while loading brain-atlas-labels-with-metadata.tsv'), err);
        return;
    }
    var parsedTSV = tsv.parse(fileContent).filter((e) => e.value !== ''); //for some reasons, some entries have an empty  value and should be removed
    vtkAtlasTSV = parsedTSV;
    vtkConversion();
});


//---------------------------------------------- LOOKING FOR VTK FILES ----------------------------------------------//
fs.readdir('../../slicer/models', function (err, files) {
    if (err) {
        console.log(errorLog('Error while loading the list of vtk files'), err);
        return;
    }
    vtkFiles = files;
    console.log(successLog(vtkFiles.length+" vtk files found"));
    vtkConversion();
});

//----------------------------------- VTK CONVERSION FROM TSV DESCRIPTION TO JSON -----------------------------------//
function vtkConversion () {
    if (vtkAtlasTSV && vtkFiles) {

        var numberOfDataSources = 0;
        var usedVTKFiles = [];
        var structuresWithoutVTKFile = [];

        for (var i = 1; i < vtkAtlasTSV.length; i++) {

            var structure = {
                "@id" : uuid.v4(),
                "@type" : "structure",
                sourceSelector : {},
                annotation : {
                    name : vtkAtlasTSV[i].label,
                    radlexId : vtkAtlasTSV[i]['radlex_id'],
                    radlexStructureId : vtkAtlasTSV[i]['radlex_structure_id']
                },
                renderOptions : {
                    color : vtkAtlasTSV[i].color
                }
            };

            var fileNames = vtkFiles.filter((name) => name.includes('Model_'+vtkAtlasTSV[i].value+'_'));
            var fileName = fileNames.length > 0 ? fileNames[0] : null;

            if (fileNames.length > 1) {
                throw "Error : several vtk files match the same value";
            }

            //create data source only if the file exists
            if (fileName) {
                var dataSource = {
                    "@id" : uuid.v4(),
                    "@type" : "datasource",
                    "mimeType" : "application/octet-stream",
                    "source" : "../../slicer/models/"+fileName
                };
                JSONResult.push(dataSource);
                usedVTKFiles.push(fileName);

                structure.sourceSelector.dataSource = dataSource["@id"];
                numberOfDataSources++;
            }
            else {
                structuresWithoutVTKFile.push(vtkAtlasTSV[i].label);
            }

            JSONResult.push(structure);
        }

        console.log(successLog(numberOfDataSources+" data source(s) created in vtk conversion"));
        console.log(warningLog('Warning'), 'useless vtk files : ', JSON.stringify(vtkFiles.filter((name) => usedVTKFiles.indexOf(name) === -1), null, 4));
        console.log(successLog(i+" structure(s) created in vtk conversion"));
        console.log(warningLog('Warning'), 'structures without vtk files : ', JSON.stringify(structuresWithoutVTKFile, null, 4));

        writeJSONFile();
        vtkConversion.done = true;
    }
}

//---------------------------------------- FETCH HNCMA ATLAS TSV DESCRIPTION ----------------------------------------//
fs.readFile('../../labelinfo/hncma-atlas-lut.tsv', 'utf-8', function (err, tsvContent) {
    if (err) {
        console.log(errorLog('Error while loading hncma-atlas-lut.tsv'),err);
        return;
    }
    var parsedTSV = tsv.parse(tsvContent).filter((e) => e.value !== ''); //for some reasons, some entries have an empty  value and should be removed
    hncmaAtlasTSV = parsedTSV;
    nrrdConversion();
});

//------------------------------------------- FETCH AND PARSE COLOR TABLE -------------------------------------------//
fs.readFile('../../slicer/colortables/hncma-atlas-lut.ctbl', 'utf-8', function (err, colorTableContent) {
    if (err) {
        console.log(errorLog('Error while loading hncma-atlas-lut.ctbl'), err);
        return;
    }
    //------------------------------------- GET RID OF COMMENTS LINES AND PARSE -------------------------------------//
    var regexp = /^#.*\r?\n/gm;
    colorTableContent = colorTableContent.replace(regexp, '');
    //insert header to parse with tsv
    colorTableContent = 'value name red green blue alpha\n'+colorTableContent;
    var ssv = new Parser(' '); //Space  Separated Parser
    parsedColorTable = ssv.parse(colorTableContent).filter((e) => e.value !== '');
    hncmaColorTable = parsedColorTable;
    nrrdConversion();
});

//------------------------------ CHECK IF COLORS OF HNCMA MATCH IN TSV AND COLORTABLES ------------------------------//
function colorCheck () {
    if (hncmaAtlasTSV && hncmaColorTable) {
        //----------------------------------- COMPARISON FROM TSV TO COLOR TABLE ------------------------------------//
        var labelsNotMatching =[];
        var tsvEntriesWithoutMatchInColorTable = [];
        hncmaAtlasTSV.filter( function (tsvEntry) {
            var matchingEntries = hncmaColorTable.filter((colorEntry) => colorEntry.value === tsvEntry.value);
            if (matchingEntries.length === 0) {
                tsvEntriesWithourMatchingInColorTable.push(tsvEntry);
                return false;
            }
            else {
                //now checking if colors match
                var extractedColors = tsvEntry.color.match(/\d+/g).map(Number);
                var colorTableEntry = matchingEntries[0];
                if (extractedColors[0]===Number(colorTableEntry.red) && extractedColors[1]===Number(colorTableEntry.green) && extractedColors[2]===Number(colorTableEntry.blue)) {
                    return true;
                }
                else {
                    labelsNotMatching.push(tsvEntry.value);
                    return false;
                }
            }
        });
        //display result
        if (tsvEntriesWithoutMatchInColorTable.length > 0) {
            console.log(errorLog('Error : mismatching entries : '), tsvEntriesWithoutMatchInColorTable.length+' tsv entrie(s) without matching entry in color tables : ', tsvEntriesWithoutMatchInColorTable);
        }
        else {
            console.log(successLog('All the tsv entries have a match in the color table'));
        }

        //----------------------------------- COMPARISON FROM COLOR TABLE TO TSV ------------------------------------//
        var colorTableEntriesWithoutMatchInTSV = [];
        hncmaColorTable.filter( function (colorTableEntry) {
            var matchingEntries = hncmaAtlasTSV.filter((tsvEntry) => tsvEntry.value === colorTableEntry.value);
            if (matchingEntries.length === 0) {
                colorTableEntriesWithoutMatchInTSV.push(colorTableEntry);
                return false;
            }
            else {
                //now checking if colors match
                var tsvEntry = matchingEntries[0];
                var extractedColors = tsvEntry.color.match(/\d+/g).map(Number);
                if (extractedColors[0]===Number(colorTableEntry.red) && extractedColors[1]===Number(colorTableEntry.green) && extractedColors[2]===Number(colorTableEntry.blue)) {
                    return true;
                }
                else {
                    if (labelsNotMatching.indexOf(colorTableEntry.value)===-1) {
                        labelsNotMatching.push(colorTableEntry.value);
                    }
                    return false;
                }
            }
        });
        //display result
        if (colorTableEntriesWithoutMatchInTSV.length > 0) {
            console.log(errorLog('Error : mismatching entries : '), colorTableEntriesWithoutMatchInTSV.length+' color table entrie(s) without matching entry in tsv : ', colorTableEntriesWithoutMatchInTSV);
        }
        else {
            console.log(successLog('All the color table entries have a match in the tsv'));
        }

        //display final  color matching result
        if (labelsNotMatching.length > 0) {
            console.log(errorLog('Error : mismatching entries : '), 'label(s) with color not matching in tsv and color table : ', labelsNotMatching);
        }
        else {
            console.log(successLog('Every label color in the tsv file matches the one in the color table'));
        }
    }
}


//------------------------------------------------ FETCH NRRD FILES ------------------------------------------------//
fs.readFile('../../slicer/volumes/labels/hncma-atlas.nrrd', function(err, data) {
    nrrdParser(err, data, hncma,  'hncma-atlas.nrrd');
});

fs.readFile('../../slicer/volumes/labels/skin.nrrd', function(err, data) {
    nrrdParser(err, data, skin,  'skin.nrrd');
});


function nrrdParser (err, data, resultObject, fileName) {
    if (err) {
        return console.log(errorLog('Error while loading '+fileName),err);
    }
    //------------------------------------ LOOKING FOR THE BEGINNING OF THE DATA ------------------------------------//
    //we need two 10 in a row which means '\n\n' or 10 13 10 13'\n\r\n\r' for windows support
    var endOfHeader = 0;
    var i =0;
    while (endOfHeader === 0) {
        if (data[i] === 10 && data[i+1] === 10) {
            endOfHeader = i+1;
        }
        else if (data[i] === 10 && data[i+1] === 13 && data[i+2] === 10 && data[i+3] === 13) {
            endOfHeader = i+3;
        }
        i++;
    }
    //--------------------------------------------- DECOMPRESSING DATA ----------------------------------------------//
    var dataCompressed = new Buffer(data.length-endOfHeader);
    //copy
    for (var i = endOfHeader+1 ; i<data.length; i++) {
        dataCompressed[i-endOfHeader-1] = data[i];
    }
    var decrompressed = zlib.gunzipSync(dataCompressed);

    //----------------------------------------- RETRIEVING SHORT INT VALUES -----------------------------------------//
    //--------------------------------- AND STORING ALL THE DIFFERENT LABELS FOUND ----------------------------------//
    var voxels = new Uint16Array(decrompressed.length/2);
    resultObject.labels = {};
    for(var i = 0; i<voxels.length; i++) {
        voxels[i] = decrompressed[2*i] + 256*decrompressed[2*i+1]; // little endian
        resultObject.labels[voxels[i]]=true;
    }
    resultObject.data = voxels;
    console.log(successLog(fileName+' has been parsed with success'));
    nrrdConversion();
}


//---------------------------------- NRRD CONVERSION FROM TSV DESCRIPTION TO JSON -----------------------------------//
function nrrdConversion () {
    debugger;
    if (hncma.data && skin.data && hncmaAtlasTSV && hncmaColorTable) {
        var hncmaDataSource = {
            "@id" : uuid.v4(),
            "@type" : "datasource",
            "mimeType" : "application/x-nrrd",
            "source" : "../../slicer/volumes/hncma-atlas.nrrd"
        };
        var skinDataSource = {
            "@id" : uuid.v4(),
            "@type" : "datasource",
            "mimeType" : "application/x-nrrd",
            "source" : "../../slicer/volumes/skin.nrrd"
        };

        console.log(successLog('2 data sources created from nrrd files'));

        var entriesWithoutNRRDMatch = [];
        for (var i = 1; i < hncmaAtlasTSV.length; i++) {
            var structure = {
                "@id" : uuid.v4(),
                "@type" : "structure",
                sourceSelector : {
                    dataKey : hncmaAtlasTSV[i].value
                },
                annotation : {
                    name : hncmaAtlasTSV[i].label
                },
                renderOptions : {}
            };

            //find color in color table (we are assuming that entries are matching cf color match checker)
            var colorTableEntry = hncmaColorTable.find((e) => e.value === hncmaAtlasTSV[i].value);
            structure.renderOptions.color = 'rgba('+colorTableEntry.red+','+colorTableEntry.green+','+colorTableEntry.blue+','+colorTableEntry.alpha+')';

            //finding the matching datasource

            if (hncma.labels[hncmaAtlasTSV[i].value]) {
                structure.sourceSelector.dataSource = hncmaDataSource['@id'];
            }
            else if (skin.labels[hncmaAtlasTSV[i].value]) {
                structure.sourceSelector.dataSource = skinDataSource['@id'];
            }
            else {
                entriesWithoutNRRDMatch.push(hncmaAtlasTSV[i]);
            }

            JSONResult.push(structure);
        }
        console.log(successLog(i+' structure(s) created from nrrd files'));
        if (entriesWithoutNRRDMatch.length >0) {
            console.log(warningLog('Warning : ')," no match found in the nrrd files for these structure : ", JSON.stringify(entriesWithoutNRRDMatch.map((e)=>e.label), null, 4));
        }
        nrrdConversion.done = true;
        writeJSONFile();
    }
}


//------------------------------------------------ WRITING JSON FILE ------------------------------------------------//
function writeJSONFile () {
    if (nrrdConversion.done && vtkConversion.done) {
        fs.writeFile("atlasStructure.json", JSON.stringify(JSONResult, null, 4), function(err) {
            if(err) {
                return console.log(errorLog('Error while writing atlas structure : '), err);
            }

            console.log(successLog("The JSON file was saved!"));
            console.log('done in '+(Date.now()-initialDate)+'ms');
        }); 
    }
}