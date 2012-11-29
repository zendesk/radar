var Persistence = require('./persistence.js'),
    logging = require('minilog')('core');

// in order to know which particular session lost messages, we need to track message counts per client id
// in order to apply INCRBY() operations on the system total,
// - we need to track the messages that arrived after the last sync
// - we need to track the absolute values of the client's sent/received counters

var sessions = {};

function Audit() { }

function emptyStat() {
  return {
    // running counters on the server side
    serverSent: 0,
    serverReceived: 0,
    // to track the change since last INCRBY()
    serverSentPrev: 0,
    serverReceivedPrev: 0,
    // client counters (from last audit message)
    clientSent: 0,
    clientReceived: 0,
    // to track the change since last INCRBY()
    clientSentPrev: 0,
    clientReceivedPrev: 0,
  };
}

// when a message is received from a client
Audit.receive = function(client) {
  if(!client || !client.id) return;
  if(!sessions[client.id]) {
    sessions[client.id] = emptyStat();
  }
  sessions[client.id].serverReceived++;
};

// when a message is sent to a client
Audit.send = function(client) {
  if(!client || !client.id) return;
  if(!sessions[client.id]) {
    sessions[client.id] = emptyStat();
  }
  sessions[client.id].serverSent++;
};

// when the client sends an audit message, write the stats for the current client to the log
Audit.log = function(client, message) {
  if(!client || !client.id || !message || !message.received || !message.sent) return;
  // update the client totals in the tracker
  if(!sessions[client.id]) {
    sessions[client.id] = emptyStat();
  }
  sessions[client.id].clientSent = message.sent;
  sessions[client.id].clientReceived = message.received;

  // compare the client and server values for this client, and write the logs
  if(sent[client.id] != message.sent || received[client.id] != message.received) {
    logging.info('#audit_error', sessions[client.id]);
  } else {
    logging.info('#audit', sessions[client.id]);
  }
};

// periodically update the totals
Audit.totals = function() {
  // calculate the change from the last values
  var serverSentIncr = 0,
      serverReceivedIncr = 0,
      clientSentIncr = 0,
      clientReceivedIncr = 0,
      prefix = 'radar:/audit/ddmmyy/';

  Object.keys(sessions).forEach(function(cid) {
    // after determining the increase, update serverSentPrev and serverReceivedPrev to current
    if(sessions[cid].serverSent) {
      serverSentIncr += sessions[cid].serverSent - sessions[cid].serverSentPrev;
      sessions[cid].serverSentPrev = sessions[cid].serverSent;
    }
    if(sessions[cid].serverReceived) {
      serverReceivedIncr += sessions[cid].serverReceived - sessions[cid].serverReceivedPrev;
      sessions[cid].serverReceivedPrev = sessions[cid].serverReceived;
    }
    if(sessions[cid].clientSent) {
      clientSentIncr += sessions[cid].clientSent - sessions[cid].clientSentPrev;
      sessions[cid].clientSentPrev = sessions[cid].clientSent;
    }
    if(sessions[cid].clientReceived) {
      clientReceivedIncr += sessions[cid].clientReceived - sessions[cid].clientReceivedPrev;
      sessions[cid].clientReceivedPrev = sessions[cid].clientReceived;
    }
  });

  // increment system totals in Redis
  Persistence.incrBy(prefix+'server/sent', serverSentIncr);
  Persistence.incrBy(prefix+'server/received', serverReceivedIncr);
  Persistence.incrBy(prefix+'client/sent', clientSentIncr);
  Persistence.incrBy(prefix+'client/received', clientReceivedIncr);
};

module.exports = Audit;
