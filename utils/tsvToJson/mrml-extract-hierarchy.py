import sys
import xml.etree.cElementTree as ET
import copy
import types
import json
import os.path
# import yaml

from pprint import pprint

def indexTopLevelNodesById(root, selector='.'):
    idTable = {}

    for node in root.findall(selector):
        idTable[node.get('id')] = node

    return idTable


def denode(table):
    nodeTable = {}
    for i, t in table.iteritems():
        node = copy.copy(t.attrib)
        node['_tag'] = t.tag
        nodeTable[i] = node

    return nodeTable

def buildChildren(table):
    for i, t in table.iteritems():
        try:
            parentNodeRef = t['parentNodeRef']
        except KeyError:
            t['isRoot'] = True
            continue

        t['isRoot'] = False
        parent = table[parentNodeRef]
        try:
            children = parent['children']
        except KeyError:
            children = parent['children'] = []

        if i not in children:
            children.append(i)


def dereferenceAttributes(table, attrNames):
    attrSet = set(attrNames)
    for i, t in table.iteritems():
        for k, v in t.iteritems():
            if k in attrSet:
                if isinstance(v, types.StringTypes):
                    t[k] = table[v]
                else:
                    t[k] = [table[x] for x in v]


def modelFileSelector(table, node):
    if node.has_key('associatedNodeRef'):
        node = table[node['associatedNodeRef']]

    if node.has_key('storageNodeRef'):
        storageNode = table[node['storageNodeRef']]
        return os.path.basename(storageNode['fileName'])

    return None

def colorSelector(table, node):
    if node.has_key('displayNodeID'):
        maybeDisplayNode = table[node['displayNodeID']]
        if maybeDisplayNode['_tag'] == 'ModelDisplay':
            return convertModelDisplayNodeColorToCSS3(maybeDisplayNode)
        else:
            # it is actually a model node
            sneakyDisplayNode = table[maybeDisplayNode['displayNodeRef']]
            return convertModelDisplayNodeColorToCSS3(sneakyDisplayNode)

    if node.has_key('associatedNodeRef'):
        modelDisplayNode = table[table[node['associatedNodeRef']]['displayNodeRef']]
        return convertModelDisplayNodeColorToCSS3(modelDisplayNode)        

    return None


def nameSelector(table, colorTable, node):
    tag = node['_tag']
    if tag != 'ModelHierarchy':
        return node['name']

    if not node.has_key('associatedNodeRef'):
        return node['name']

    
    associatedNodeRef = node['associatedNodeRef']
    associatedNodeRefName = table[associatedNodeRef]['name']
    if associatedNodeRefName.startswith('Model_'):
        return colorTable[associatedNodeRefName.split('_')[1]]['name']
    

def convertColorToCSS3(r, g, b, t=255):
    return 'rgba(%d,%d,%d,%f)' % (int(r), int(g), int(b), float(t)/255.0)


def convertModelDisplayNodeColorToCSS3(n):

    color = n['color']
    opacity = float(n['opacity'])
    v = [int(255.0*float(x)) for x in color.split()]
    if opacity == 1.0:
        return 'rgb(%d,%d,%d)' % tuple(v)
    else:
        v.append(opacity)
        return 'rgba(%d,%d,%d,%f)' % tuple(v)



def parseColorTableFile(filename):
    table = {}
    fp = open(filename, 'rU')
    for line in fp:
        line = line.strip()
        if not line or line[0] == '#':
            continue
        val, name, fr, fg, fb, ft = line.split()
        name = ' '.join(name.split('_'))
        table[val] = dict(name=name, color=convertColorToCSS3(fr, fg, fb, ft))
    fp.close()
    return table

def buildOutputTable(idTable, colorTable):
    toplevelTable = {}
    hierarchyTable = toplevelTable['Hierarchies'] = {}
    defaultHierarchy = hierarchyTable['__default__'] = {}
    hierarchyRoots = []
    defaultHierarchy['__root__'] = dict(children=hierarchyRoots)

    nodeTable = toplevelTable['nodes'] = {}

    for i, t in idTable.iteritems():
        if t['_tag'] != 'ModelHierarchy':
            continue

        node = {'id' : t['id']}
        setIfNotNone(node, 'name', nameSelector(idTable, colorTable, t))
        setIfNotNone(node, 'color', colorSelector(idTable, t))
        setIfNotNone(node, 'modelFile', modelFileSelector(idTable, t))

        nodeTable[t['id']] = node

        if t.has_key('children'):
            hierarchyNode = dict(id = t['id'], 
                                 children = t['children'])
            defaultHierarchy[t['id']] = hierarchyNode

        if t['isRoot']:
            hierarchyRoots.append(t['id'])

    return toplevelTable
            
def setIfNotNone(d, attr, value):
    if value:
        d[attr] = value

if __name__ == '__main__':
    filename = sys.argv[1]
    xmlTree = ET.parse(filename)
    xmlRoot = xmlTree.getroot()

    colorTableFilename = sys.argv[2]
    colorTable = parseColorTableFile(colorTableFilename)
    # print colorTable

    idTable = denode(indexTopLevelNodesById(xmlRoot, './*'))
    buildChildren(idTable)

    outputTable = buildOutputTable(idTable, colorTable)
    result = json.dumps(outputTable, sort_keys=True, indent=4, separators=(',', ': '))
    f = open('extractedHierarchy.json','w')
    f.write(result)
    print result
