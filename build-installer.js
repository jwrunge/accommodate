const path = require('path')
const { MSICreator } = require('electron-wix-msi')

//Define input/output
const APP_DIR = path.resolve(__dirname, './release-builds/accommodate-win32-x64')
const OUT_DIR = path.resolve(__dirname, './release-builds/win32')

const misCreator = new MSICreator({
    appDirectory: APP_DIR,
    outputDirectory: OUT_DIR,

    //Config
    description: "Accommodations management and letter generator",
    exe: "accommodate",
    name: "Accommodate",
    manufacturer: "Jake Runge",
    version: "1.0.0",

    //UI
    ui: {
        chooseDirectory: true
    }
})

//.wxs template file
misCreator.create().then(()=> {
    //Compile template to .msi
    misCreator.compile()
})