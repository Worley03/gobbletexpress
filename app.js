import express from 'express';
import http from 'http';
import * as socketIo from 'socket.io';

const port = process.env.PORT || 3000;


//let currentTurn = 'player1'; // Initialize the turn to Player 1
let roomStates = {}; // Keeps track of the state of each room

function resetRoomState(roomId) {
    roomStates[roomId] = { players: [], currentPlayer: 'player1', currentTurn: 'player1' };
    // Any other initial state settings as needed
}

const app = express();
const httpServer = http.createServer(app);
const io = new socketIo.Server(httpServer, {
    cors: {
        origin: "https://worley03.github.io/", // Your client's URL
        methods: ["GET", "POST"]
    }
});

io.on('connection', (socket) => {
    console.log(`User with socket ID ${socket.id} connected`);
    socket.on('checkRoom', (room, callback) => {
        const roomSize = io.sockets.adapter.rooms.get(room)?.size || 0;
        const isFull = roomSize >= 2;
        callback(isFull);
    });


    socket.on('joinRoom', (room) => {
        const roomSize = io.sockets.adapter.rooms.get(room)?.size || 0;

        if (roomSize < 2) {
            socket.join(room);
            // Handle joining room logic here
            // Assign player role
            let playerRole = roomSize === 0 ? 'player1' : 'player2';
            console.log(`User with socket ID ${socket.id} joined room: ${room} as ${playerRole}`);
            socket.emit('roleAssigned', playerRole);

        } else {
            // Send a message back to the client if the room is full
            socket.emit('roomFull', `Room ${room} is already full`);
        }
        if (!roomStates[room]) {
            roomStates[room] = { players: [socket.id], currentPlayer: 'player1', currentTurn: 'player1' };
        } else {
            roomStates[room].players.push(socket.id);
            // Notify both players that the game can start when the second player joins
            if (roomStates[room].players.length === 2) {
                io.to(room).emit('gameStart');
            }
        }
    });

    socket.on('makeMove', (data) => {
        const roomState = roomStates[data.room];

        if (socket.id === roomState.players[roomState.currentTurn === 'player1' ? 0 : 1]) {
            roomState.currentTurn = roomState.currentTurn === 'player1' ? 'player2' : 'player1';
            roomState.currentPlayer = roomState.currentTurn;
            io.to(data.room).emit('moveMade', {
                newGridCells: data.newGridCells,
                nextTurn: roomState.currentTurn
            });
        }
        console.log(`${data}`);
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
            }

            // Reset the room if it's empty or under certain conditions
            if (roomStates[room].players.length === 0) {
                resetRoomState(room);
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
                // Reset or update the room as necessary
                if (state.players.length === 0) {
                    resetRoomState(room);
                    console.log(`${room} reset`);
                } else {
                    // Additional logic if other players are still in the room
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