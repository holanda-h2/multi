console.log('> Script started')
const express = require('express')
const webApp = express()
const webServer = require('http').createServer(webApp)
const io = require('socket.io')(webServer)

const game = createGame()
let maxConcurrentConnections = 15


let questions = [{
        question: "Qual é o menor número natural?",
        answers: ['1', '3', '0', '2'],
        correct: 2
    },
    {
        question: "Observe a sequência dos números (1,2,4,7,11,16,...).<br>Qual é o próximo número dessa sequência?",
        answers: ['21', '22', '23', '24'],
        correct: 1
    },
    {
        question: "Qual é a diferença entre dois números pares consecutivos?",
        answers: ['1', '2', '3', '0'],
        correct: 1
    }
]

let nrQuestion = 0;
let question = questions[nrQuestion];
let geraQuestion = false;

function sorteioQuestion() {
    nrQuestion = Math.floor(Math.random() * questions.length);
    question = questions[nrQuestion];
}

webApp.use(express.json({ extended: false }));

webApp.get('/', function(req, res) {
    res.sendFile(__dirname + '/game.html')
})

// Coisas que só uma POC vai conhecer
webApp.get('/admin', function(req, res) {
    res.sendFile(__dirname + '/game-admin.html')
})

webApp.get('/collect.mp3', function(req, res) {
    res.sendFile(__dirname + '/collect.mp3')
})

webApp.get('/100-collect.mp3', function(req, res) {
    res.sendFile(__dirname + '/100-collect.mp3')
})

setInterval(() => {
    io.emit('concurrent-connections', io.engine.clientsCount)
}, 5000)


io.on('connection', function(socket) {
    const admin = socket.handshake.query.admin

    if (io.engine.clientsCount > maxConcurrentConnections && !admin) {
        socket.emit('show-max-concurrent-connections-message')
        socket.conn.close()
        return
    } else {
        socket.emit('hide-max-concurrent-connections-message')
    }
    const playerState = game.addPlayer(socket.id, socket.id)
    socket.emit('bootstrap', game)

    socket.broadcast.emit('player-update', {
        socketId: socket.id,
        newState: playerState
    })

    socket.on('player-move', (direction) => {
        game.movePlayer(socket.id, direction)

        const fruitColisionIds = game.checkForFruitColision()

        socket.broadcast.emit('player-update', {
            socketId: socket.id,
            newState: game.players[socket.id]
        })

        if (fruitColisionIds) {
            io.emit('fruit-remove', {
                fruitId: fruitColisionIds.fruitId,
                score: game.players[socket.id].score,
                socketId: socket.id
            })
            socket.emit('update-player-score', game.players[socket.id].score)
        }

    })

    socket.on('player-nome', (socketId, nome) => {

        game.players[socketId].nome = nome

        console.log("Nome................", game.players[socketId])


        io.emit('update-player-nome', {
                socketId: socketId,
                newState: game.players[socketId]
            })
            //socket.emit('update-player-score', game.players[socket.id].score)

    })

    socket.on('player-answer', (socketId, op) => {

        let player = game.players[socketId];

        let ans = (op == question.correct);

        if (ans) {
            player.score = player.score + 1
        }

        // game.players[socketId].nome = nome

        // console.log("Nome................", game.players[socketId])


        io.emit('update-player-answer', {
                socketId: socketId,
                answer: ans,
                score: player.score,
                resposta: question.answers[op],
                socketNome: game.players[socketId].nome
            })
            // socket.emit('update-player-score', game.players[socket.id].score)

        geraQuestion = true;

    })

    socket.on('disconnect', () => {
        game.removePlayer(socket.id)
        socket.broadcast.emit('player-remove', socket.id)
    })


    let fruitGameInterval
    socket.on('admin-start-fruit-game', (interval) => {
        console.log('> Fruit Game start')

        geraQuestion = true;

        clearInterval(fruitGameInterval)

        fruitGameInterval = setInterval(() => {

            // const fruitData = null;
            console.log(Object.keys(game.fruits).length);
            //  if (Object.keys(game.fruits).length != 0) {
            if (!geraQuestion) {
                return;
            }

            const fruitData = game.addFruit()
                //  }

            if (fruitData) {
                io.emit('fruit-add', fruitData)
                geraQuestion = false
            }
        }, interval)
    })

    socket.on('admin-stop-fruit-game', () => {
        console.log('> Fruit Game stop')
        clearInterval(fruitGameInterval)

        geraQuestion = false;
    })

    socket.on('admin-start-crazy-mode', () => {
        io.emit('start-crazy-mode')
    })

    socket.on('admin-stop-crazy-mode', () => {
        io.emit('stop-crazy-mode')
    })

    socket.on('admin-clear-scores', () => {
        game.clearScores()
        io.emit('bootstrap', game)
    })

    socket.on('admin-concurrent-connections', (newConcurrentConnections) => {
        maxConcurrentConnections = newConcurrentConnections
    })

});

webServer.listen(process.env.PORT || 3000, function() {
    console.log('> Server listening on port:', process.env.PORT || 3000)
});





function createGame() {
    console.log('> Starting new game')
    let fruitGameInterval

    const game = {
        canvasWidth: 30,
        canvasHeight: 30,
        players: {},
        fruits: {},
        addPlayer,
        removePlayer,
        movePlayer,
        addFruit,
        removeFruit,
        checkForFruitColision,
        clearScores
    }

    function addPlayer(socketId, nome) {
        return game.players[socketId] = {
            x: Math.floor(Math.random() * game.canvasWidth),
            y: Math.floor(Math.random() * game.canvasHeight),
            score: 0,
            nome: nome //"N:" + socketId
        }
    }

    function removePlayer(socketId) {
        delete game.players[socketId]
    }

    function movePlayer(socketId, direction) {
        const player = game.players[socketId]

        if (direction === 'left' && player.x - 1 >= 0) {
            player.x = player.x - 1
        }

        if (direction === 'up' && player.y - 1 >= 0) {
            player.y = player.y - 1
        }

        if (direction === 'right' && player.x + 1 < game.canvasWidth) {
            player.x = player.x + 1
        }

        if (direction === 'down' && player.y + 1 < game.canvasHeight) {
            player.y = player.y + 1
        }

        return player
    }

    function addFruit() {
        const fruitRandomId = Math.floor(Math.random() * 10000000)
        const fruitRandomX = Math.floor(Math.random() * game.canvasWidth)
        const fruitRandomY = Math.floor(Math.random() * game.canvasHeight)

        sorteioQuestion();

        for (fruitId in game.fruits) {
            const fruit = game.fruits[fruitId]

            if (fruit.x === fruitRandomX && fruit.y === fruitRandomY) {
                return false
            }

        }

        game.fruits[fruitRandomId] = {
            x: fruitRandomX,
            y: fruitRandomY,
            question: question
        }

        return {
            fruitId: fruitRandomId,
            x: fruitRandomX,
            y: fruitRandomY,
            question: question
        }

    }

    function removeFruit(fruitId) {
        delete game.fruits[fruitId]
    }

    function checkForFruitColision() {
        for (fruitId in game.fruits) {
            const fruit = game.fruits[fruitId]

            for (socketId in game.players) {
                const player = game.players[socketId]

                if (fruit.x === player.x && fruit.y === player.y) {
                    // player.score = player.score + 1
                    game.removeFruit(fruitId)

                    return {
                        socketId: socketId,
                        fruitId: fruitId
                    }
                }
            }
        }
    }

    function clearScores() {
        for (socketId in game.players) {
            game.players[socketId].score = 0
        }
    }

    return game
}
