exports.configs = {
    '*': {
        hooks: './builder/hook.js',
        options: {
            isEnableHotUpdate: {
                label: "是否打开热更功能",
                description: "主开关,请不要打开构建Md5 Cache选项。否则功能无效",
                default: false,
                render: {
                    ui: 'ui-checkbox',
                },
            },
            serverVersion: {
                label: "版本号",
                default: "1.0.0",
                description: "配置当前打包的版本号。版本低的会根据版本号来判断是否要更新。版本号越大越新",
                render: {
                    ui: 'ui-input',
                },
            },
            serverAddr: {
                label: "热更服务端地址",
                description: "配置用于热更的服务器地址",
                default: "http://localhost:8080/update",
                render: {
                    ui: 'ui-input',
                },
            },
            isSyncAssetsFile: {
                label: "是否同步本地Assets的配置",
                description: "同步本地文件的打包文件信息。",
                default: true,
                render: {
                    ui: 'ui-checkbox',
                },
            },
            isBuildServerFile: {
                label: "是否生成服务端文件",
                default: false,
                render: {
                    ui: 'ui-checkbox',
                },
            },
            saveDir: {
                label: "服务端热更文件保存目录",
                default: "./server-files",
                render: {
                    ui: 'ui-input',
                },
            },
        },
    },
};

