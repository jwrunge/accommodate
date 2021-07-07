const Datastore = require('nedb')
const app = require('electron').remote.app

const root = app.getAppPath()

let abbreviate = (content, limit)=> {
    if(content && content.length > limit)
        return content.substr(0, limit) + '...'
    else return content
}

function saveLOA(data, datadir = root + '/data') {
    return new Promise((resolve, reject)=> {
        const db = new Datastore({ 
            filename: datadir + '/loas.db',
            autoload: true
        })

        const record = new Datastore({ 
            filename: datadir + '/records.db',
            autoload: true
        })
    
        db.update(
            { "student._id": data.student._id }, //Find
            {
                $set: data
            }, //Update data
            { upsert: true }, //options
            (err)=>{
                if(err) reject()
                
                else record.insert(
                    data,
                    (err)=>{
                        if(err) reject()
                        resolve(true)
                    }
                )
            }
        )
    })
}

function loadLOA(student, datadir = root + '/data') {
    return new Promise((resolve, reject)=>{
        const db = new Datastore({ 
            filename: datadir + '/loas.db',
            autoload: true
        })
        db.findOne({"student._id": student._id}, (err, doc)=>{
            if(err) reject(err)
            else resolve(doc)
        })
    })
}

function searchLOA(search, datadir = root + '/data') {
    return new Promise((resolve, reject)=>{
        const db = new Datastore({ 
            filename: datadir + '/loas.db',
            autoload: true
        })
    
        db.find(
            {
                $or: [
                    {"student._id": search._id},
                    {
                        $and: [
                            {"student.fname": search.fname},
                            {"student.lname": search.lname}
                        ]
                    },
                    {"student.fname": search.fname},
                    {"student.lname": search.lname}
                ]
            }
        ).limit(25).exec((err, doc)=>{
                if(err) reject(err)
                else resolve(doc)
            }
        )
    })
}

function loadAccommodations(datadir = root + '/data') {
    return new Promise((resolve, reject)=>{
        const db = new Datastore({ 
            filename: datadir + '/accoms.db',
            autoload: true
        })
        db.find({})
        .sort({name: 1})
        .exec((err, doc)=>{
            if(err) reject(err)
            else resolve(doc)
        })
    })
}

function saveAccommodation(data, datadir = root + '/data') {
    return new Promise((resolve, reject)=> {
        const db = new Datastore({ 
            filename: datadir + '/accoms.db',
            autoload: true
        })
    
        db.update(
            { _id: data._id }, //Find
            data, //Update data
            { upsert: true }, //options
            (err)=>{
                if(err) reject()
                resolve(true)
            }
        )
    })
}

function removeAccommodation(id, datadir = root + '/data') {
    return new Promise((resolve, reject)=> {
        const db = new Datastore({ 
            filename: datadir + '/accoms.db',
            autoload: true
        })
    
        db.remove(
            { _id: id },
            {},
            (err)=>{
                if(err) reject()
                resolve(true)
            }
        )
    })
}

function loadStudents(skip, take, search = "", datadir = root + '/data') {
    return new Promise((resolve, reject)=>{
        const db = new Datastore({ 
            filename: datadir + '/loas.db',
            autoload: true
        })

        let findFunc = null
        if(search && search.includes(' ') || search.includes(',')) {
            let searchTerms 
            if(search.includes(', ')) searchTerms = search.split(", ")
            else if(search.includes(',')) searchTerms = search.split(",")
            else searchTerms = search.split(" ")

            findFunc = db.find({
                $or: [
                    {$and: [
                        { "student.fname": new RegExp(searchTerms[0].replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i') },
                        { "student.lname": new RegExp(searchTerms[1].replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i') }
                    ]},
                    {$and: [
                        { "student.fname": new RegExp(searchTerms[1].replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i') },
                        { "student.lname": new RegExp(searchTerms[0].replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i') }
                    ]}
                ]
            })
        }
        else if(search) {
            findFunc = db.find({
                $or: [
                    { "student._id": new RegExp(search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i') },
                    { "student.fname": new RegExp(search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i') },
                    { "student.lname": new RegExp(search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i') }
                ]
            })
        }
        else {
            findFunc = db.find({})
        }

        findFunc.skip(skip).limit(take).exec((err, doc)=>{
            if(err) reject(err)
            else {
                doc.forEach((student)=>{
                    if(student.accoms) {
                        student.accomsList = student.accoms.map(accom=>{
                            return accom.name
                        })
                    }
                })
                resolve(doc)
            }
        })
    })
}

function countStudents(datadir = root + '/data') {
    return new Promise((resolve, reject)=> {
        const db = new Datastore({ 
            filename: datadir + '/loas.db',
            autoload: true
        })

        db.count({}, (err, count) => {
            if(err) reject(err)
            else resolve(count)
        })
    })
}

function saveStudent(data, datadir = root + '/data') {
    return new Promise((resolve, reject)=> {
        const db = new Datastore({ 
            filename: datadir + '/loas.db',
            autoload: true
        })
    
        db.update(
            { "student._id": data.student._id }, //Find
            data, //Update data
            { upsert: true }, //options
            (err)=>{
                if(err) reject()
                resolve(true)
            }
        )
    })
}

function removeStudent(id, datadir = root + '/data') {
    return new Promise((resolve, reject)=> {
        const db = new Datastore({ 
            filename: datadir + '/loas.db',
            autoload: true
        })
    
        db.remove(
            { "student._id": id },
            {},
            (err)=>{
                if(err) reject()
                resolve(true)
            }
        )
    })
}

function loadRecords(id, datadir = root + '/data') {
    return new Promise((resolve, reject)=>{
        const loas = new Datastore({ 
            filename: datadir + '/loas.db',
            autoload: true
        })
        const records = new Datastore({ 
            filename: datadir + '/records.db',
            autoload: true
        })

        loas.findOne({"student._id": id}, (err, student)=>{
            if(err) reject(err)
            else records.find({"student._id": id}, (err, records)=>{
                if(err) reject(err)
                else {
                    student.records = records.sort((a,b)=>{
                        return b.dateUpdated - a.dateUpdated
                    })
                    resolve(student)
                }
            })
        })
    })
}

export {
    abbreviate, 
    saveLOA, 
    loadLOA, 
    searchLOA, 
    loadAccommodations, 
    saveAccommodation, 
    removeAccommodation,
    loadStudents, 
    saveStudent, 
    countStudents,
    removeStudent,
    loadRecords
}