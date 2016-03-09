//all the path given relatively to mrmlToJson.js script
module.exports = {
    mrmlFileLocation : "../../slicer/brain-atlas.mrml",
    colorTableFileLocation : "../../slicer/colortables/hncma-atlas-lut.ctbl",
    vtkFilesDirectory : "../../slicer/models/",
    jsonResultFileName : "../atlasStructure.json",
    header : {
        "@type": "header",
        "species": "human",
        "organ": "brain",
        "name" : "The SPL/NAC Brain Atlas",
        "license" : "?",
        "citation" : "?",
        "version" : "1",
        "contact" : "https://github.com/stity/spl-brain-atlas",
        "comment" : "",
        "coordinate_system" : "self defined"
    }
}
