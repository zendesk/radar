How Presence Works
=================

Presence is split into four separate parts: the presence object, the presence manager, the presence store datastructure  and the sentry system.

Presence APIs
============

.set('online'):
- This works by subscribing to the resource and adding the client/user to the manager. We subscribe to the resource here because client disconnection works through unsubcribe. We add an resource.unsubscribe to the 'close' event, and the close event fires during a n/w disconnect on the socket.

.set('offline'):
- Here we try to remove the client/user explicitly from the manager. We also unsubscribe from the resource if we never subscribed to it.

.unsubscribe():
- When engine.io socket is broken, a 'close' event fires. We listen to the close event and invoke a resource's unsubscribe method in response. A client can send an unsubscribe message which can invoke this too. This tries to remove the client implicitly from the manager (so it can setup the user for a buffered expiry if needed). This is followed by a resource unsubscribe as well.

.get/sync():
- These work by reloading everything from redis which synchronizes the presence store with what is in redis. Then, we ask the manager for a full report of users and clients and this is sent as the response.

Presence Store
=============

.add()
- This adds a client/user/userType to the system. Events like user_added and client_added are thrown if they are entries.

.remove()
- This removes a client/user/userType from the store. Events like user_removed and client_removed are emitted if they are actually removed.

.removeClient()
- This only removes a clientId and prevents removal of an empty user if it is the last client. This will be used when we do implicit disconnections for a client. Please refer to Presence manager: .processRedisEntry() section on when this is invoked.

Note that all these APIs ignore redundant operations and only emit events if there are actual changes to store state. So adding the same client twice does not emit client_added. Similarly, removing an non-existant client or a user will not cause any events.

Presence manager
================

The manager forwards events from the presence store to the main presence object which then broadcasts them to interested clients.

All messages received from the clients (through the main presence object), are published to redis. The message then reflects back and is correctly handled. Due to this, there is no difference between a local message and a remote message. Both are handled exactly the same way.

.addClient()
- Publish and persist a client/user addition to redis.

.removeClient()
- Publish and persist a client/user removal to redis. The message is marked as an explicit offline. (set(offline))

.disconnectClient()
- Publish and persist a client removal to redis. This time, the message is marked explicit:false.

.processRedisEntry()
- This is the handler for all incoming messages from redis. Our own messages reflecting back are also handled here. Here, we analyse the message and appropriately add them to the store or remove them. If we are removing client/users, we infer the nature of disconnection (explicit or not). If it is an ungraceful disconnect (explicit:false), we only remove the client and setup an user expiry timeout which removes the user after a small period of time. The user is removed only if it is completely empty (zero clients for the user in the store). If an online message arrives within the time window, this timeout is cleared.

Sentry system
============

The sentry system is designed to watch the liveness of other radar server instances connected to the same redis. Presence not only has to worry about clients disconnecting unexpectedly, but also servers themselves disappearing with all their clients along with it. Each radar server runs one instance of a sentry. Each online message entry (client+user) in the system has a sentry associated with it. The sentry of a message is the sentry-id of the server who owns the client.

.start()
- When the server starts, we load a hash which contains all online sentries. Each sentry-id is a server and we get a full picture of who is alive at the moment. We also publish/persist our own sentry-keep-alives to redis. In addition to this, we listen to the sentry pubsub channel for other sentry-keep-alives.

.run()
- start() sets up a interval timer (10000ms or configurable)  which does two things: publish/persist a keep alive message, and look at our available information to determine expired sentries. For each of the expired sentries, we emit a 'down' event.

.isAlive()
- Looks at our sentry-map and returns alive or not.

Using the sentry system, each online message is stamped with the sentry-id of the server before it is published/persisted to redis. When an online message is received from redis, we check if its sentry is still alive. If not, we treat it as an implicit disconnect.

When the presence manager starts, it subscribes to the 'down' event from the server's sentry. If a sentry goes down, we find all clients for that sentry and implicitly disconnect them.

Explicit/Implicit offlines workflow
===================================

Explicit offlines happen when a client does .set('offline') on the resource. This has a simple workflow: Presence resource asks the manager to remove client/user from the manager. The manager will publish this request (with online:false, explicit:true) to redis and it will be received by all interested servers including itself. The processRedisEntry() method then will then ask the store to remove both client and user. The store produces a client_removed event on successful removal of the client, and a user_removed if there are no more clients for the user. These events will then be translated to client_offline and user_offline messages to be broadcast to subscribed clients.

A little map: .set('offline') -> manager.removeClient() -> redis -> manager.processRedisEntry() -> store.remove() -> user_removed/client_removed events -> user_offline/client_offline messages.

Implicit offlines are a little stranger. One way to generate them is to call .unsubscribe() from the client side on the resource. An unsubscribe() will be internally called if the socket closes unexpectedly as well. The presence resource will ask the manager to only remove the client in this case (manager.disconnectClient). This request will be published to redis with explicit:false. When processRedisEntry() receives it, it asks the store to only remove a client (store.removeClient). An empty user may be left behind in the store if this is the last client of that user. The manager will nevertheless setup a userExpiry timer for the user, even it there are other clients. When the timer fires, it will check if the user is empty and remove the user from the store. Each removal causes events which are translated into client_offline and user_offline messages to be broadcast to other clients.

User expiry has to work correctly under more complex conditions: For example, client1 for user1 may do an implicit disconnect starting up a user expiry. At this point if client2 of user1 does an explicit disconnect, we should still do a delayed user_offline for that user (because client1 might comeback within that period). For more finer points on this, please refer to processRedisEntry() in presence manager.

A little map: .unsubscribe() (either from socket close or client message) -> manager.disconnectClient() -> redis -> manager.processRedisEntry() -> store.removeClient() + user expiry setup -> client_removed event -> client_offline message.

on user expiry timeout -> store.removeUserIfEmpty() (if user exists and no clients) -> user_removed -> user_offline message.

Known issues
============

1. Presence offline messages and subscribe(): When using a subscribe(), we are guaranteed to receive all subsequent online messages and all offline messages for those clients. However, it is possible that we do not receive any offline notifications for clients we never knew about. For a client who is tracking who is currently online, it makes sense. However, for a client who is tracking all presence notifications after subscribe() this is broken/inconsistent. A workaround is to always use sync(), without caring about the response callback for sync. (This will be fixed at a later point) 
