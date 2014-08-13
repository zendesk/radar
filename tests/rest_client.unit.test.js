/* globals describe, it, beforeEach, afterEach */
var assert = require('assert'),
    sinon = require('sinon'),
    httpRequest = require('request'),
    RESTClient = require('../server/rest_client.js');

function noop(){}

describe('RESTClient', function() {
  var message = { op: 'set', to: 'status:/test/ticket/1' },
      url = 'http://localhost.com/radar-api',
      outgoing = { on: noop, setHeader: noop, emit: noop, end: noop },
      client;

  describe('.get', function() {
    it('should create a client if one does not yet exist for the given id', function() {
      assert.equal(0, Object.keys(RESTClient.clients).length);
      client = RESTClient.get({ headers: { 'x-radar-id': 'abc' } }, outgoing);
      assert.equal(1, Object.keys(RESTClient.clients).length);
      assert(RESTClient.clients[client.id] instanceof RESTClient);
    });

    it('should not create a client if one already exists for the given id', function() {
      assert.strictEqual(client, RESTClient.get({ headers: { 'x-radar-id': client.id } }, outgoing));
    });

    it('should create a client if no id is given', function() {
      var client = RESTClient.get({ headers: { } }, outgoing);
      assert.equal(2, Object.keys(RESTClient.clients).length);
      client.emit('close');
    });

    it('should listen to the close event of the client and delete the reference when the client is closed', function() {
      client.emit('close');
      assert.equal(0, Object.keys(RESTClient.clients).length);
    });
  });

  describe('.constructor', function() {
    it('should listen for the close event from the response', function() {
      sinon.stub(outgoing, 'on', function(name) {
        assert.equal('close', name);
      });
      new RESTClient({}, outgoing);
      assert(outgoing.on.called);
      outgoing.on.restore();
    });
  });

  describe('#close', function() {
    beforeEach(function() {
      client = new RESTClient({}, outgoing);
    });

    it('should mark the client as closed (preventing writing to the initial request)', function() {
      assert(!client.closed);
      client.close();
      assert(client.closed);
    });

    it('should emit close when there are no subscriptions', function() {
      var spy = sinon.spy();
      client.on('close', spy);
      client.close();
      assert(spy.calledOnce);
    });

    it('should not emit close when there are subscriptions', function() {
      var spy = sinon.spy();
      client.on('close', spy);
      client.subscriptions.test = true;
      client.close();
      assert(!spy.called);
      delete client.subscriptions.test;
    });
  });

  describe('#sendJSON', function() {
    client = new RESTClient({}, outgoing);

    it('should call #send with a JSON stringified version of the message if there are no subscriptions matching the scope', function() {
      sinon.stub(client, 'send');
      client.sendJSON({ test: 123 });
      assert(client.send.calledWith('{"test":123}'));
      client.send.restore();
    });

    it('should divert messages to a post if there are subscriptions matching the scope', function() {
      sinon.stub(httpRequest, 'post');
      client.subscriptions[message.to] = url;
      client.sendJSON(message);
      assert(httpRequest.post.calledWith(url, { json: message, headers: { 'X-RADAR-ID': client.id } }, sinon.match.func));
      httpRequest.post.restore();
    });

    it('should bind #_handleSubscriptionResponse with context and scope', function() {
      sinon.stub(client._handleSubscriptionResponse, 'bind');
      client.subscriptions[message.to] = url;
      client.sendJSON(message);
      assert(client._handleSubscriptionResponse.bind.calledWith(client, message.to));
      client._handleSubscriptionResponse.bind.restore();
    });
  });

  describe('#_handleSubscriptionResponse', function() {
    beforeEach(function() {
      sinon.stub(client, 'emit');
    });

    afterEach(function() {
      client.emit.restore();
    });

    it('should unsubscribe if there was an error', function() {
      client._handleSubscriptionResponse(message.to, 'an error', null, {});
      assert(client.emit.calledWith('message', JSON.stringify({ to: message.to, op: 'unsubscribe' })));
    });

    it('should unsubscribe if there is not a valid acknowledgement', function() {
      client._handleSubscriptionResponse(message.to, null, null, { ack: false });
      assert(client.emit.calledWith('message', JSON.stringify({ to: message.to, op: 'unsubscribe' })));
    });
  });

  describe('#unsubscribe', function() {
    it('should remove the specified subscription', function() {
      client.subscriptions[message.to] = url;
      client.unsubscribe(message.to);
      assert(!client.subscriptions[message.to]);
    });

    it('should close the client if there are no subscriptions left', function() {
      sinon.stub(client, 'close');
      client.subscriptions[message.to] = url;
      client.unsubscribe(message.to);
      assert(client.close.calledOnce);
      client.close.restore();
    });
  });

  describe('#send', function() {
    beforeEach(function() {
      client = new RESTClient({}, outgoing);
    });

    it('should send a response', function() {
      sinon.stub(outgoing, 'end');
      sinon.stub(outgoing, 'setHeader');
      sinon.stub(outgoing, 'emit');
      var data = JSON.stringify({ test: 123 });
      client.send(data);
      assert(outgoing.setHeader.calledTwice);
      assert(outgoing.setHeader.calledWith('Content-Type', 'text/plain'));
      assert(outgoing.setHeader.calledWith('X-RADAR-ID', client.id));
      assert(outgoing.end.calledWith(data));
      assert(outgoing.emit.calledWith('close'));
      outgoing.setHeader.restore();
      outgoing.end.restore();
      outgoing.emit.restore();
    });

    it('should not send a response if the client is closed', function() {
      sinon.stub(outgoing, 'end');
      var data = JSON.stringify({ test: 123 });
      client.closed = true;
      client.send(data);
      assert(!outgoing.end.called);
      outgoing.end.restore();
    });
  });

  describe('#ping', function() {
    it('should send a ping response', function() {
      sinon.stub(client, 'sendJSON');
      client.ping();
      assert(client.sendJSON.calledWith({ pong: 'Radar running' }));
      client.sendJSON.restore();
    });
  });
});
