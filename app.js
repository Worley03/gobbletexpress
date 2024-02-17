import express from 'express';
import http from 'http';
import * as socketIo from 'socket.io';

const port = process.env.PORT || 3000;

//let currentTurn = 'player1'; // Initialize the turn to Player 1
let roomStates = {}; // Keeps track of the state of each room
let playerRoles = {}; // Initialize an empty object
let lastPlayerLeft = {}; // Declare in a higher scope


function resetRoomState(roomId) {
    roomStates[roomId] = {
        players: [],
        currentTurn: 'player1',
        timeoutId: null,
        currentBoard: [] // Initialize currentBoard as an empty array
    };
    // Any other initial state settings as needed
}

function resetLastLeft(roomId) {
    delete lastPlayerLeft[roomId]
}

function resetInactivityTimer(roomId) {
    // Clear existing timer
    if (roomStates[roomId]?.timeoutId) {
        clearTimeout(roomStates[roomId].timeoutId);
        console.log(`Room ${roomId} inactivity timer has been reset.`);
    }

    // Set a new timer
    roomStates[roomId].timeoutId = setTimeout(() => {
        console.log(`Room ${roomId} has been reset due to inactivity.`);
        resetRoomState(roomId);
        resetLastLeft(roomId);
        // Optionally, notify players in the room about the reset
    }, 300000);  // 5 minutes = 300000 milliseconds
}

const app = express();
const httpServer = http.createServer(app);
const io = new socketIo.Server(httpServer, {
    cors: {
        origin: "*", // Your client's URL
        methods: ["GET", "POST"]
    },
    connectionStateRecovery: {
        // the backup duration of the sessions and the packets
        maxDisconnectionDuration: 2 * 60 * 1000,
        // whether to skip middlewares upon successful recovery
        skipMiddlewares: true,
      }
});

io.on('connection', (socket) => {
    if (socket.recovered) {
        console.log(`User with socket ID ${socket.id} reconnected to ${socket.rooms}`);
        socket.to(socket.rooms).emit('opponentConnected');
        // check for recovery, if recovery was successful: socket.id, socket.rooms and socket.data were restored
    } else {
        // run initial room join fuctions
        console.log(`User with socket ID ${socket.id} connected`);
        socket.on('checkRoom', (room, callback) => {
            const roomSize = io.sockets.adapter.rooms.get(room)?.size || 0;
            const isFull = roomSize >= 2;
            callback(isFull);
        });
    }


    socket.on('joinRoom', (room) => {
        const roomSize = io.sockets.adapter.rooms.get(room)?.size || 0;

        if (roomSize < 2) {
            socket.join(room);
            let playerRole;
    
            if (!lastPlayerLeft[room]) {
                playerRole = roomSize === 0 ? 'player1' : 'player2';
            } else {
                playerRole = lastPlayerLeft[room];
                delete lastPlayerLeft[room]; // Reset lastPlayerLeft for the room
            }
    
            console.log(`User with socket ID ${socket.id} joined room: ${room} as ${playerRole}`);
            socket.emit('roleAssigned', playerRole);
            playerRoles[socket.id] = playerRole; 

        } else {
            // Send a message back to the client if the room is full
            socket.emit('roomFull', `Room ${room} is already full`);
        }
        if (!roomStates[room]) {
            roomStates[room] = { players: [socket.id], currentTurn: 'player1' };
        } else {
            roomStates[room].players.push(socket.id);
            if (roomStates[room] && roomStates[room].currentBoard) {
                io.to(room).emit('moveMade', {
                    newGridCells: roomStates[room].currentBoard,
                    nextTurn: roomStates[room].currentTurn
                });
            }
            // Notify both players that the game can start when the second player joins
            if (roomStates[room].players.length === 2) {
                socket.emit('opponentConnected');
                socket.to(room).emit('opponentConnected');
                io.to(room).emit('gameStart');
                resetInactivityTimer(room);  // Reset inactivity timer
            }
        }
    });

    socket.on('makeMove', (data) => {
        const roomState = roomStates[data.room];

        if (socket.id === roomState.players[roomState.currentTurn === 'player1' ? 0 : 1]) {
            roomState.currentTurn = roomState.currentTurn === 'player1' ? 'player2' : 'player1';
            roomState.currentBoard = data.newGridCells; // Save newGridCells as currentBoard
            io.to(data.room).emit('moveMade', {
                newGridCells: data.newGridCells,
                nextTurn: roomState.currentTurn
            });
        }
        resetInactivityTimer(data.room);  // Reset inactivity timer
        console.log(`Room ${data.room}, ${data.newGridCells}`);
    });

    socket.on('leaveRoom', (room) => {
        const roomSize = io.sockets.adapter.rooms.get(room)?.size || 0;
        console.log(`User with socket ID ${socket.id} left ${room}`);
        socket.leave(room);
        console.log(`Room size ${roomSize}`);


        // Remove the player from the room state
        if (roomStates[room]) {
            const index = roomStates[room].players.indexOf(socket.id);
            if (index !== -1) {
                roomStates[room].players.splice(index, 1);
                lastPlayerLeft[room] = playerRoles[socket.id]; // Update lastPlayerLeft for the room
                delete playerRoles[socket.id]; 
            }
            if (roomStates[room].players.length === 1) {
                // Notify the remaining player that their opponent has left
                io.to(roomStates[room].players[0]).emit('opponentDisconnected');
            }
                // Reset the room if it's empty or under certain conditions
            else if (roomStates[room].players.length === 0) {
                resetRoomState(room);
                resetLastLeft(room);
                console.log(`${room} reset`);
            }
        }
    });


    socket.on('disconnect', () => {
        console.log(`User with socket ID ${socket.id} disconnected`);
        for (const [room, state] of Object.entries(roomStates)) {
            const playerIndex = state.players.indexOf(socket.id);
            if (playerIndex !== -1) {
                state.players.splice(playerIndex, 1);
                lastPlayerLeft[room] = playerRoles[socket.id]; // Update lastPlayerLeft for the room
                delete playerRoles[socket.id];
                // Reset or update the room as necessary
                if (state.players.length === 1) {
                    // Notify the remaining player that their opponent has disconnected
                    io.to(state.players[0]).emit('opponentDisconnected');
                } else if (state.players.length === 0) {
                    resetRoomState(room);
                    resetLastLeft(room);
                    console.log(`${room} reset`);
                }

                break; // Stop searching once the player's room is found
            }
        }
    });
});

// Start the HTTP server, not the Express app
httpServer.listen(port, () => {
    console.log('Server is running on port ' + port);
});
