/**
 * 
 */

// import {selectCardsForPlayer} from 'cards.js';
const WebSocketServer = require('websocket').server;
const http = require('http');
const fs = require('fs');

const server = http.createServer(function(request, response) {
  // process HTTP request. Since we're writing just WebSockets
  // server we don't have to implement anything.
});
server.listen(process.env.OPENSHIFT_NODEJS_PORT || 8080, function() { });


// list of all the clients
const questionsObj = JSON.parse(fs.readFileSync('./questions.json'));
let questions = shuffle(questionsObj.questions);

const cardsObj = JSON.parse(fs.readFileSync('./cards.json'));
let gameCards = JSON.parse(JSON.stringify(shuffle(cardsObj.cards)));

const maxScore = 3;
const cardsByPlayer = 4;

let players = [];
let globalPlayerIndex = 0; 
let isGameStarted = false;
let isSelectingPhase = false;
let isGameOver = false;

let observerIndex = 0;
let questionIndex = 0;
let selectedCards = [];

// create the server
wsServer = new WebSocketServer({
  httpServer: server
});


// WebSocket server
wsServer.on('request', function(request) {

  let connection = request.accept(null, request.origin);
  let id;
  let isRegistered = false;
  let isAdmin = false;
  let playerIndex;

  // user game info 
  let userName;
  let score;
  let isSelecting;
  let isObserver = false;

  // This is the most important callback for us, we'll handle
  // all messages from users here.
  connection.on('message', function(message) {
    console.log(message);

    if (message.type === 'utf8') {
      
      // register new player, only if game has not started yet!
      if(isRegistered === false){

        if(isGameStarted == true)
          connection.sendUTF(JSON.stringify({ isRegistered: false, code: 1 }));

        else{
          let msgObj = JSON.parse(message.utf8Data);
          
          userName = msgObj.userName;
          score = 0;
          isSelecting = false;
          id = Date.now();

          if(msgObj.isAdmin !== undefined){
            isAdmin = msgObj.isAdmin;
          }
          
          let player = {
            connection : connection,
            userName : userName,
            isAdmin : isAdmin,
            score : 0,
            isSelecting : isSelecting,
            hasSelected : false,
            isObserver : false,
            id : id,
            cards : getSelectedCardsForPlayer()
          };

          players.push(player);
          isRegistered = true;
          playerIndex = globalPlayerIndex;
          globalPlayerIndex ++;

        
          connection.sendUTF(JSON.stringify({ isRegistered: true, id : id}));
        }
      }
      // start game if admin sends the right request 
      else if( isAdmin && !isGameStarted){
        if(players.length < 3){
          connection.sendUTF(JSON.stringify({ isGameStarted: false, msg: "cannot start a game with less then 3 players"}));
          return;
        }

        let msgObj = JSON.parse(message.utf8Data);

        if(msgObj.isGameStarted === true){
          isGameStarted = true;
          isSelectingPhase = true;

          
          // TODO: inform players and shuffel cards
          players[observerIndex].isObserver = true;
          observerIndex ++;

          let playersClone = [];
          players.forEach(p => {
            let pTemp = {
              userName : p.userName,
              isObserver : p.isObserver,
              score : p.score
            };
            playersClone.push(pTemp);
          });
          

          players.forEach(p => {
            if(p.id == id)
              isObserver = p.isObserver;

            p.connection.sendUTF(JSON.stringify({ isGameStarted: true, isObserver: p.isObserver, players : playersClone, cards: p.cards, question: questions[questionIndex]}));
          });
        }
      }
      else if ( isGameStarted && isSelectingPhase){
        let msgObj = JSON.parse(message.utf8Data);

        let selectingPhaseFinished = true;
        players.forEach(p =>{
          if(p.id == id || p.isObserver === true)
            p.hasSelected = true;
          
          if(p.id == id && p.isObserver === false){
            let i = 0;
            let fi = 0;
            p.cards.forEach(c => {
              if(c.cardId == msgObj.cardId)
                fi = i;
              i++;
            });

            p.cards.splice(fi, 1);
          }

          if(p.hasSelected === false)
            selectingPhaseFinished = false;
        });

        let selectedCard = {
          playerId : id,
          cardId : msgObj.cardId
        };

        selectedCards.push(selectedCard);

        if(selectingPhaseFinished){
          players.forEach(p => {
            p.connection.sendUTF(JSON.stringify({ isGameStarted: true, isSelectingPhase: false, isShowPhase: true, selectedCards : getSelectedCards(cardsObj.cards, selectedCards)}));
          });

          isSelectingPhase = false;
        }
      }
      // obseerver 
      else if (isGameStarted && !isSelectingPhase){
        let msgObj = JSON.parse(message.utf8Data);

        let playerWonId;
        selectedCards.forEach(c =>{
          if(c.cardId == msgObj.cardId){
            playerWonId = c.playerId;
            console.log("player won: "+ c.playerId);
          }
        });

        players.forEach(p => {
          if(p.id == playerWonId)
            p.score ++;
          if(p.score == maxScore)
            isGameOver = true; 
          
          p.cards.push(addCardToPlayer());
          p.isObserver = false;
          p.hasSelected = false;
        });
        
        if(isGameOver === false){
          questionIndex ++;
          if(questionIndex >= questions.length)
            questionIndex = 0;

          players[observerIndex].isObserver = true;
          observerIndex ++;

          if(observerIndex >= players.length)
            observerIndex = 0;
          
          isSelectingPhase = true;
          selectedCards = [];

          let playersClone = [];
          players.forEach(p => {
            let pTemp = {
              userName : p.userName,
              isObserver : p.isObserver,
              score : p.score
            };
            playersClone.push(pTemp);
          });

          players.forEach(p => {
            if(p.id == id)
              isObserver = p.isObserver;

            p.connection.sendUTF(JSON.stringify({ isGameStarted: true, isSelectingPhase: isSelectingPhase, isShowWinnerPhase: true, isObserver: p.isObserver, cards: p.cards, playerWonId: playerWonId, players : playersClone, cardWonId: msgObj.cardId, question: questions[questionIndex] }));
          });

        }else{

          let playersClone = [];
          players.forEach(p => {
            let pTemp = {
              userName : p.userName,
              isObserver : p.isObserver,
              score : p.score
            };
            playersClone.push(pTemp);
          });

          // TODO: clear and reset game!
          players.forEach(p => {
            p.connection.sendUTF(JSON.stringify({ isGameOver:true, isGameStarted: false, isSelectingPhase: false, isShowWinnerPhase: true, playerWonId: playerWonId, players : playersClone, cardWonId: msgObj.cardId }));
          });

          isRegistered == false;
          isGameStarted = false;
          players = [];
          selectedCards = [];

          observerIndex = 0;
          questionIndex = 0;
          isAdmin = false;
        }
      }

      else
        connection.sendUTF(JSON.stringify({ msg: "there is nothing to do right now"}));
      // connection.sendUTF("hallo from ssserver");
    }
  });

  connection.on('close', function(connection) {
    // close user connection
  });
});

/* UTIL FUNCTIONS */ 
function getSelectedCardsForPlayer(){
  let selectedCards = []

  if(cardsByPlayer >= gameCards.length)
    gameCards = shuffle(cardsObj.cards);

  let i = 0;
  gameCards.forEach(c => {
    if(i < cardsByPlayer)
      selectedCards.push(c);

    i++;
  });

  gameCards.splice(0,cardsByPlayer);
  /*
  let selectedCards = [
    {
       cardId: 0,
       cardText: "SELINA" 
    },
    {
       cardId: 2,
       cardText: "AIDS" 
    },
    {
       cardId: 3,
       cardText: "Mit Jakob Supreme" 
    }
];*/

return selectedCards;
}

function addCardToPlayer(){
  if(1 >= gameCards.length)
    gameCards = shuffle(cardsObj.cards);
   
  let card = gameCards[0];
  gameCards.splice(0,1);

  return card;
}

/**
 * Shuffles array in place.
 * @param {Array} a items An array containing the items.
 */
function shuffle(a) {
  var j, x, i;
  for (i = a.length - 1; i > 0; i--) {
      j = Math.floor(Math.random() * (i + 1));
      x = a[i];
      a[i] = a[j];
      a[j] = x;
  }
  return a;
}

function getSelectedCards(cards, selectedCardsIds){
  let selectedCards = [];

  cards.forEach(c =>{
    selectedCardsIds.forEach(s =>{
      if(c.cardId == s.cardId)
        selectedCards.push(c);
    });
  });

  return selectedCards;
}