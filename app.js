const { app, BrowserWindow, Menu } = require('electron')
const path = require('path')
const dotenv = require('dotenv');
dotenv.config();

function createWindow () {
    let watcher 
    if(process.env.NODE_ENV === 'development') {
        watcher = require('chokidar').watch(path.join(__dirname, '/public/bundle.js'), { ignoreInitial: true })
        watcher.on('change', ()=> {
            win.reload()
        })
    }

    // Create the browser window.
    let win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true
        }
    })

    // and load the index.html of the app.
    win.loadFile('./index.html')

    // win.webContents.openDevTools()

    win.on('closed', ()=> {
        watcher.close()
        win = null
    })

    // const menuTemplate = []

    // const menu = Menu.buildFromTemplate(menuTemplate)
    // Menu.setApplicationMenu(menu)
}

app.on('ready', createWindow)

// Quit when all windows are closed.
app.on('window-all-closed', () => {
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (mainWindow === null) {
        createWindow();
    }
});