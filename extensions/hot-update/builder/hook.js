
'use strict';

var fs = require("fs");
var path = require("path");
const os = require("os");
var crypto = require('crypto');

const PACKAGE_NAME = 'hot-update';

var inject_script = `
(function () {
    if (typeof window.jsb === 'object') {
        var hotUpdateSearchPaths = localStorage.getItem('HotUpdateSearchPaths');
        if (hotUpdateSearchPaths) {
            var paths = JSON.parse(hotUpdateSearchPaths);
            jsb.fileUtils.setSearchPaths(paths);

            var fileList = [];
            var storagePath = paths[0] || '';
            var tempPath = storagePath + '_temp/';
            var baseOffset = tempPath.length;

            if (jsb.fileUtils.isDirectoryExist(tempPath) && !jsb.fileUtils.isFileExist(tempPath + 'project.manifest.temp')) {
                jsb.fileUtils.listFilesRecursively(tempPath, fileList);
                fileList.forEach(srcPath => {
                    var relativePath = srcPath.substr(baseOffset);
                    var dstPath = storagePath + relativePath;

                    if (srcPath[srcPath.length] == '/') {
                        jsb.fileUtils.createDirectory(dstPath)
                    }
                    else {
                        if (jsb.fileUtils.isFileExist(dstPath)) {
                            jsb.fileUtils.removeFile(dstPath)
                        }
                        jsb.fileUtils.renameFile(srcPath, dstPath);
                    }
                })
                jsb.fileUtils.removeDirectory(tempPath);
            }
        }
    }
})();
`;

function copyDir(dir, target) {
    try {
        if(!target) return;
        var stat = fs.statSync(dir);
        if (!stat.isDirectory()) {
            return;
        }
        mkdirSync(target);
        var subpaths = fs.readdirSync(dir);
        for (var i = 0; i < subpaths.length; ++i) {
            let fname = subpaths[i]
            var subpath = path.join(dir, fname);
            stat = fs.statSync(subpath);
            if (stat.isDirectory()) {
                copyDir(subpath, path.join(target, fname));
            }
            else if (stat.isFile()) {
                fs.copyFileSync(subpath, path.join(target, fname));
            }
        }
    } catch (err) {
        console.error(err)
    }
}

function delDir(path){
    let files = [];
    if(fs.existsSync(path)){
        files = fs.readdirSync(path);
        files.forEach((file, index) => {
            let curPath = path + "/" + file;
            if(fs.statSync(curPath).isDirectory()){
                delDir(curPath);
            } else {
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(path);
    }
}

function readDir(src, dir, obj, copyDir) {
    try {
        var stat = fs.statSync(dir);
        if (!stat.isDirectory()) {
            return;
        }
        if(copyDir) {
            mkdirSync(copyDir);
        }
        var subpaths = fs.readdirSync(dir), subpath, size, md5, compressed, relative;
        for (var i = 0; i < subpaths.length; ++i) {
            if (subpaths[i][0] === '.') {
                continue;
            }
            let fname = subpaths[i]
            subpath = path.join(dir, fname);
            stat = fs.statSync(subpath);
            if (stat.isDirectory()) {
                readDir(src, subpath, obj, copyDir ? path.join(copyDir, fname) : null);
            }
            else if (stat.isFile()) {
                // Size in Bytes
                size = stat['size'];
                md5 = crypto.createHash('md5').update(fs.readFileSync(subpath)).digest('hex');
                compressed = path.extname(subpath).toLowerCase() === '.zip';

                relative = path.relative(src, subpath);
                relative = relative.replace(/\\/g, '/');
                relative = encodeURI(relative);
                obj[relative] = {
                    'size': size,
                    'md5': md5
                };
                if (compressed) {
                    obj[relative].compressed = true;
                }
                if(copyDir) {
                    fs.copyFileSync(subpath, path.join(copyDir, fname));
                }
            }
        }
    } catch (err) {
        console.error(err)
    }
}

var mkdirSync = function (p) {
    try {
        fs.mkdirSync(p);
    } catch (e) {
        if (e.code != 'EEXIST') throw e;
    }
}

function getIPAdress() {
    var interfaces = os.networkInterfaces();
    for (var devName in interfaces) {
        var iface = interfaces[devName];
        for (var i = 0; i < iface.length; i++) {
            var alias = iface[i];
            if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
                return alias.address;
            }
        }
    }
}

exports.onAfterBuild = function (options, result) {
    const pkgOptions = options.packages[PACKAGE_NAME];
    console.log("~~~~~~~~~~~~~" + PACKAGE_NAME + "~~~~~~~~~~~~~")
    console.log(PACKAGE_NAME, pkgOptions)
    if(!pkgOptions.isEnableHotUpdate) {
        return;
    }

    let resdir = 'data';
    var url = path.join(result.dest, 'data', 'main.js');
    if (!fs.existsSync(url)) {
        url = path.join(result.dest, 'assets', 'main.js');
        resdir = "assets"
    }
    if(fs.existsSync(url)) {
        let data = fs.readFileSync(url, "utf8");
        var newStr = inject_script + data;
        fs.writeFileSync(url, newStr);
        console.log(PACKAGE_NAME, 'inject_script successfully');
    } else {
        console.log(PACKAGE_NAME, 'inject_script failed');
    }

    if(!pkgOptions.isBuildServerFile && !pkgOptions.isSyncAssetsFile) {
        return;
    }

    console.log(PACKAGE_NAME, resdir);
    let serverAddr = pkgOptions.serverAddr;
    if(!serverAddr.endsWith('/')) {
        serverAddr += '/';
    }
    if(serverAddr.indexOf('//localhost') > 0) {
        serverAddr = serverAddr.replace('localhost', getIPAdress());
    }
    var manifest = {
        packageUrl: serverAddr,
        remoteManifestUrl: serverAddr + 'project.manifest',
        remoteVersionUrl: serverAddr + 'version.manifest',
        version: pkgOptions.serverVersion,
        assets: {},
        searchPaths: []
    };

    let src = path.join(result.dest, resdir);

    let folderNameArr = ["src", "assets", "jsb-adapter"]
    for(let i = 0; i < folderNameArr.length; i++) {
        let sub_folder = path.join(src, folderNameArr[i])
        if(fs.existsSync(sub_folder)) {
            readDir(src, sub_folder, manifest.assets);
        } else {
            console.log(PACKAGE_NAME, "not exists:", sub_folder);
        }
    }

    let manifestJson = JSON.stringify(manifest)
    let projectManifestMeta = path.join(Editor.Project.path, "assets", 'project.manifest.meta');
    if(fs.existsSync(projectManifestMeta)) {
        let meta = fs.readFileSync(projectManifestMeta, "utf8");
        let metaJson = JSON.parse(meta);
        let fileList = result.getAssetPathInfo(metaJson.uuid)
        if(fileList.length != 0) {
            let saveUuidMenifestPath = fileList[0].raw[0]
            fs.writeFileSync(saveUuidMenifestPath, manifestJson);
            console.log(PACKAGE_NAME, 'UUID project.manifest file successfully updated:' + saveUuidMenifestPath);
        }
    }

    delete manifest.assets;
    delete manifest.searchPaths;

    let versionJson = JSON.stringify(manifest);
    let versionManifestMeta = path.join(Editor.Project.path, "assets", 'version.manifest.meta');
    if(fs.existsSync(versionManifestMeta)) {
        let meta = fs.readFileSync(versionManifestMeta, "utf8");
        let metaJson = JSON.parse(meta);
        let fileList = result.getAssetPathInfo(metaJson.uuid)
        if(fileList.length != 0) {
            let saveUuidMenifestPath = fileList[0].raw[0]
            fs.writeFileSync(saveUuidMenifestPath, versionJson);
            console.log(PACKAGE_NAME, 'UUID version.manifest file successfully updated:' + saveUuidMenifestPath);
        }
    }

    if(pkgOptions.isSyncAssetsFile) {
        let destManifest = path.join(Editor.Project.path, "assets", 'project.manifest');
        fs.writeFileSync(destManifest, manifestJson);
        console.log(PACKAGE_NAME, 'Assets Manifest successfully generated');
        
        let destVersion = path.join(Editor.Project.path, "assets", 'version.manifest');
        fs.writeFileSync(destVersion, versionJson)
        console.log(PACKAGE_NAME, 'Assets Version successfully generated');
    }

    if(pkgOptions.isBuildServerFile) {
        let copyDirTarget = null;
        if(pkgOptions.isBuildServerFile) {
            if(pkgOptions.saveDir.indexOf('.') == 0){
                copyDirTarget = path.join(result.dest, pkgOptions.saveDir)
            } else {
                copyDirTarget = pkgOptions.saveDir;
            }
            console.log(PACKAGE_NAME, "copyDir:", copyDirTarget);
        }
        if(fs.existsSync(copyDirTarget)) {
            console.log(PACKAGE_NAME, 'clear old folder:'+ copyDirTarget);
            delDir(copyDirTarget)
        }
        fs.mkdirSync(copyDirTarget)
        for(let i = 0; i < folderNameArr.length; i++) {
            let sub_folder = path.join(src, folderNameArr[i])
            if(fs.existsSync(sub_folder)) {
                copyDir(sub_folder, path.join(copyDirTarget, folderNameArr[i]));
            }
        }

        let destManifest = path.join(copyDirTarget, 'project.manifest');
        fs.writeFileSync(destManifest, manifestJson);
        console.log(PACKAGE_NAME, 'Server Manifest successfully generated');

        let destVersion = path.join(copyDirTarget, 'version.manifest');
        fs.writeFileSync(destVersion, versionJson)
        console.log(PACKAGE_NAME, 'Server Version successfully generated');
    }
    
}
