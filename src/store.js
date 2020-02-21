import { writable } from 'svelte/store'
const fs = require('fs')
const app = require('electron').remote.app

const root = app.getAppPath()

export const settings = writable({})
if(fs.existsSync(root + '/appdata/appsettings.json')) {
    settings.set(JSON.parse(fs.readFileSync(root + '/appdata/appsettings.json')))
}
else {
    settings.set({
        abbrev: "Notice",
        services: "Services",
        students: "Students"
    })
}

let pluralize = (str) => {

    if(str.length > 0) {
        if(str.charAt(str.length - 1) == 'x'
            || str.charAt(str.length - 1) == 'z'
            || ( str.charAt(str.length - 1) == 'h' 
                && (str.charAt(str.length - 2) == 's'
                || str.charAt(str.length - 2) == 'c')
            )
            || ( str.charAt(str.length - 1) == 's' 
                && str.charAt(str.length - 2) == 's'
            )
        ) {
            str = str.concat('es')
        }

        else if(str.charAt(str.length - 1) != 's') {
            str = str.concat('s')
        }
    }

    return str
}

export const formatText = (str, plur = true, uc = true, allcaps = false) => {
    if(plur)
        str = pluralize(str)
    else if(str.charAt(str.length - 1) == 's')
        str = str.substring(0, str.length - 1)

    if(!allcaps) {
        str = str.toLowerCase()
        
        if(uc) 
            str = str.replace(str.charAt(0), str.charAt(0).toUpperCase(), 1)
    }
    else {
        if(str.length < 4)
            str = str.toUpperCase()
        else 
            str = str.replace(str.charAt(0), str.charAt(0).toUpperCase(), 1)
    }
    
    return str
}

export let changeSettings = (data)=> {
    fs.writeFileSync(root + '/appdata/appsettings.json', JSON.stringify(data))
}