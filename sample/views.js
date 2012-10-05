function Status(elId) {
  this.elId = elId;
  this.value = '';
};

Status.prototype.render = function(value) {
  value && (this.value = value);
  this.el || (this.el = document.getElementById(this.elId));
  this.el.innerHTML = '<p>' + this.value + '</p>';
};

function OnlineList(elId) {
  this.elId = elId;
};

OnlineList.prototype.render = function() {
  this.el || (this.el = document.getElementById(this.elId));
  var str = '';
  for(var userId in model.online) {
    if(!model.online.hasOwnProperty(userId)) continue;
    str += '<li><span class="badge';
    if(model.online[userId]) {
      str += ' badge-success';
    }
    str += '"></span> '+userId+'</li>';
  }
  this.el.innerHTML = '<ul>' + str + '</ul>';
};

function OnlineToggle(elId) {
  this.elId = elId;
};

OnlineToggle.prototype.render = function() {
  this.el || (this.el = document.getElementById(this.elId));
  var status = (model.online[RadarClient._me.userId] ? 'offline' : 'online');
  this.el.innerHTML = '<a onclick="RadarClient.presence(\'foo\').set(\''+status+'\');" href="javascript:;">Go '+status+'</a>';

};

function MessageList(elId) {
  this.elId = elId;
};

MessageList.prototype.render = function() {
  this.el || (this.el = document.getElementById(this.elId));
  var str = '';
  model.messages.forEach(function(message) {
    str += '<li>'+message.value+'</li>';
  });
  this.el.innerHTML = '<ul>' + str + '</ul>';
};

model = {
  online: {},
  messages: []
};

function onlineUpdate(message) {
  for(var userId in message.value) {
    if(!message.value.hasOwnProperty(userId)) continue;
    model.online[userId] = !!(message.op == 'online');
  }
}

view = {
  status: new Status('info'),
  online: new OnlineList('online'),
  toggle: new OnlineToggle('toggle'),
  messages: new MessageList('messages')
};

function redraw() {
  Object.keys(view).forEach(function(name) {
    var view = window.view[name];
    view.render();
  })
};
