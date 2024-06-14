import { Game } from '../game/Game';

const jsb = (<any>window).jsb;

// Custom manifest removed the following assets:
// 1. res/raw-assets/2a/2a40e5e7-4c4a-4350-9e5d-76757755cdd2.png
// 2. res/raw-assets/2d/2d86a854-63c4-4b90-8b88-a4328b8526c2.png
// So when custom manifest used, you should be able to find them in downloaded remote assets
var customManifestStr = JSON.stringify({
    packageUrl: "http://localhost:8080/update/",
    remoteManifestUrl: "http://localhost:8080/update/project.manifest",
    remoteVersionUrl: "http://localhost:8080/update/version.manifest",
    version: "1.0.0",
    assets: {
        "src/application.js": {
            size: 5514,
            md5: "d09753aaed7c55c4566cecf766cbc5c3",
        },
    },
    searchPaths: [],
});

import {
    _decorator,
    Component,
    Node,
    Label,
    ProgressBar,
    Asset,
    game,
    sys,
} from "cc";
const { ccclass, property } = _decorator;

@ccclass("HotUpdate")
export class HotUpdate extends Component {
    @property(Label)
    info: Label = null!;

    @property(Asset)
    manifestUrl: Asset = null!;

    @property(ProgressBar)
    byteProgress: ProgressBar = null;

    @property(ProgressBar)
    fileProgress: ProgressBar = null;

    @property(Label)
    fileLabel: Label = null;

    @property(Label)
    byteLabel: Label = null;

    private _updating = false;
    private _canRetry = false;
    private _waitingRestart = false;
    private _storagePath = "";
    private _am: jsb.AssetsManager = null!;
    private _checkListener = null;
    private _updateListener = null;
    private _failCount = 0;
    private versionCompareHandle: (versionA: string, versionB: string) => number = null!;

    checkCb(event: any) {
        console.log("Code: " + event.getEventCode());
        switch (event.getEventCode()) {
            case jsb.EventAssetsManager.ERROR_NO_LOCAL_MANIFEST:
                if (this.info) {
                    this.info.string = "未发现本地配置信息, 跳过热更新.";
                }
                break;
            case jsb.EventAssetsManager.ERROR_DOWNLOAD_MANIFEST:
            case jsb.EventAssetsManager.ERROR_PARSE_MANIFEST:
                if (this.info) {
                    this.info.string = "下载版本文件失败, 跳过热更新.";
                }
                break;
            case jsb.EventAssetsManager.ALREADY_UP_TO_DATE:
                if (this.info) {
                    this.info.string = "已更新到最新版本.";
                }
                break;
            case jsb.EventAssetsManager.NEW_VERSION_FOUND:
                if (this.info) {
                    this.info.string = "检测到新版本, 请更新. (" + this._am.getTotalBytes() + "kb)";
                }
                // this.panel.checkBtn.active = false;
                if (this.fileProgress) {
                    this.fileProgress.progress = 0;
                }
                if (this.byteProgress) {
                    this.byteProgress.progress = 0;
                }
                break;
            default:
                return;
        }

        this._am.setEventCallback(null!);
        this._checkListener = null;
        this._updating = false;
    }

    updateCb(event: any) {
        console.log("EventCode:", event.getEventCode())
        var needRestart = false;
        var failed = false;
        switch (event.getEventCode()) {
            case jsb.EventAssetsManager.ERROR_NO_LOCAL_MANIFEST:
                if (this.info) {
                    this.info.string = "本地未发现版本信息, 跳过热更新.";
                }
                failed = true;
                break;
            case jsb.EventAssetsManager.UPDATE_PROGRESSION:
                if(this.byteProgress) {
                    this.byteProgress.progress = event.getPercent();
                }
                if(this.fileProgress) {
                    this.fileProgress.progress = event.getPercentByFile();
                }
                if(this.fileLabel) {
                    this.fileLabel.string = event.getDownloadedFiles() + " / " + event.getTotalFiles();
                }
                if(this.byteLabel) {
                    this.byteLabel.string = event.getDownloadedBytes() + " / " + event.getTotalBytes();
                }
                var msg = event.getMessage();
                if (msg) {
                    if (this.info) {
                        this.info.string = "Updated file: " + msg;
                    }
                    // cc.log(event.getPercent()/100 + '% : ' + msg);
                }
                break;
            case jsb.EventAssetsManager.ERROR_DOWNLOAD_MANIFEST:
            case jsb.EventAssetsManager.ERROR_PARSE_MANIFEST:
                if (this.info) {
                    this.info.string = "下载版本文件失败, 跳过热更新.";
                }
                failed = true;
                break;
            case jsb.EventAssetsManager.ALREADY_UP_TO_DATE:
                if (this.info) {
                    this.info.string = "本地文件已最新.";
                }
                failed = true;
                break;
            case jsb.EventAssetsManager.UPDATE_FINISHED:
                if (this.info) {
                    this.info.string = "更新完成. " + event.getMessage();
                }
                needRestart = true;
                break;
            case jsb.EventAssetsManager.UPDATE_FAILED:
                if (this.info) {
                    this.info.string = "更新失败. " + event.getMessage();
                }
                // this.panel.retryBtn.active = true;
                this._updating = false;
                this._canRetry = true;
                break;
            case jsb.EventAssetsManager.ERROR_UPDATING:
                if (this.info) {
                    this.info.string = "更新中发生错误: " + event.getAssetId() + ", " + event.getMessage();
                }
                break;
            case jsb.EventAssetsManager.ERROR_DECOMPRESS:
                if (this.info) {
                    this.info.string = event.getMessage();
                }
                break;
            default:
                break;
        }

        if (failed) {
            this._am.setEventCallback(null!);
            this._updateListener = null;
            this._updating = false;
        }

        if (needRestart) {
            this._am.setEventCallback(null!);
            this._updateListener = null;
            // Prepend the manifest's search path
            var searchPaths = jsb.fileUtils.getSearchPaths();
            var newPaths = this._am.getLocalManifest().getSearchPaths();
            console.log(JSON.stringify(newPaths));
            Array.prototype.unshift.apply(searchPaths, newPaths);
            // This value will be retrieved and appended to the default search path during game startup,
            // please refer to samples/js-tests/main.js for detailed usage.
            // !!! Re-add the search paths in main.js is very important, otherwise, new scripts won't take effect.
            localStorage.setItem("HotUpdateSearchPaths", JSON.stringify(searchPaths));
            jsb.fileUtils.setSearchPaths(searchPaths);

            this._waitingRestart = true;
            // restart game.
            setTimeout(() => {
                this._waitingRestart = false;
                game.restart();
            }, 1000);
        }

        if(failed) {
            if(!this._waitingRestart){
                this.continueRun()
            }
        } else {
            this.retry();
        }
    }

    loadCustomManifest() {
        if (this._am.getState() === jsb.AssetsManager.State.UNINITED) {
            var manifest = new jsb.Manifest(customManifestStr, this._storagePath);
            this._am.loadLocalManifest(manifest, this._storagePath);
            if (this.info) {
                this.info.string = "Using custom manifest";
            }
        }
    }

    private _retryCnt = 3;

    retry() {
        if (!this._updating && this._canRetry) {
            if(this._retryCnt <= 0) {
                this.continueRun()
                return;                
            }
            this._retryCnt--;
            // this.panel.retryBtn.active = false;
            this._canRetry = false;

            if (this.info) {
                this.info.string = "失败的资源重试中...";
            }
            this._am.downloadFailedAssets();
        }
    }

    checkUpdate() {
        if (this._updating) {
            if (this.info) {
                this.info.string = "检测更新中...";
            }
            return;
        }
        if (this._am.getState() === jsb.AssetsManager.State.UNINITED) {
            var url = this.manifestUrl.nativeUrl;
            this._am.loadLocalManifest(url);
        }
        if (
            !this._am.getLocalManifest() ||
            !this._am.getLocalManifest().isLoaded()
        ) {
            if (this.info) {
                this.info.string = "加载本地版本信息失败...";
            }
            return;
        }
        this._am.setEventCallback(this.checkCb.bind(this));

        this._am.checkUpdate();
        this._updating = true;
    }

    hotUpdate() {
        if (this._am && !this._updating) {
            this._am.setEventCallback(this.updateCb.bind(this));

            if (this._am.getState() === jsb.AssetsManager.State.UNINITED) {
                var url = this.manifestUrl.nativeUrl;
                this._am.loadLocalManifest(url);
            }

            this._failCount = 0;
            this._am.update();
            // this.panel.updateBtn.active = false;
            this._updating = true;
        }
    }

    continueRun() {
        Game.eventTarget.emit(Game.HOT_UPDATE_CHECK_END);
    }

    protected onLoad(): void {
        Game.eventTarget.on(Game.HOT_UPDATE_CHECK_START, () => {
            this.prepareHotUpdate();
        }, this)
    }

    // use this for initialization
    prepareHotUpdate() {
        // Hot update is only available in Native build
        if (!jsb) {
            this.continueRun()
            return;
        }
        this._retryCnt = 3;
        this._storagePath = (jsb.fileUtils ? jsb.fileUtils.getWritablePath() : "/") + "remote-asset";
        console.log("Storage path for remote asset : " + this._storagePath);

        // Setup your own version compare handler, versionA and B is versions in string
        // if the return value greater than 0, versionA is greater than B,
        // if the return value equals 0, versionA equals to B,
        // if the return value smaller than 0, versionA is smaller than B.
        this.versionCompareHandle = function (versionA: string, versionB: string) {
            console.log("JS Custom Version Compare: version A is " + versionA + ", version B is " + versionB);
            var vA = versionA.split(".");
            var vB = versionB.split(".");
            for (var i = 0; i < vA.length; ++i) {
                var a = parseInt(vA[i]);
                var b = parseInt(vB[i] || "0");
                if (a === b) {
                    continue;
                } else {
                    return a - b;
                }
            }
            if (vB.length > vA.length) {
                return -1;
            } else {
                return 0;
            }
        };

        // Init with empty manifest url for testing custom manifest
        this._am = new jsb.AssetsManager(
            "",
            this._storagePath,
            this.versionCompareHandle
        );

        // Setup the verification callback, but we don't have md5 check function yet, so only print some message
        // Return true if the verification passed, otherwise return false
        this._am.setVerifyCallback(function (path: string, asset: any) {
            // When asset is compressed, we don't need to check its md5, because zip file have been deleted.
            var compressed = asset.compressed;
            // Retrieve the correct md5 value.
            var expectedMD5 = asset.md5;
            // asset.path is relative path and path is absolute.
            var relativePath = asset.path;
            // The size of asset file, but this value could be absent.
            var size = asset.size;
            if (compressed) {
                if (this.info) {
                    this.info.string = "验证文件通过 : " + relativePath;
                }
                return true;
            } else {
                if (this.info) {
                    this.info.string = "验证文件通过 : " + relativePath + " (" + expectedMD5 + ")";
                }
                return true;
            }
        });

        if (this.info) {
            this.info.string = "热更新已就绪, 等待更新中.";
        }
        if(this.fileProgress) {
            this.fileProgress.progress = 0;
        }
        if(this.byteProgress) {
            this.byteProgress.progress = 0;
        }
        this.hotUpdate()
    }

    onDestroy() {
        if (this._updateListener) {
            this._am.setEventCallback(null!);
            this._updateListener = null;
        }
        Game.eventTarget.targetOff(this)
    }
}
