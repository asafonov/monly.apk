class AbstractList {
  constructor (list) {
    this.list = this.getList() || list || {};
  }
  getList() {
    if (this.list === null || this.list === undefined) {
      this.list = JSON.parse(window.localStorage.getItem(this.constructor.name));
    }
    return this.list;
  }
  getDefault() {
    return Object.keys(this.list)[0];
  }
  getItem (id) {
    if (this.list === null || this.list === undefined) {
      this.getList();
    }
    return this.list[id];
  }
  updateItem (id, item) {
    this.list[id] = item;
    this.store();
  }
  updateId (id, newid) {
    this.list[newid] = this.list[id];
    this.deleteItem(id);
  }
  deleteItem (id) {
    delete this.list[id];
    this.store();
  }
  store() {
    window.localStorage.setItem(this.constructor.name, JSON.stringify(this.list));
  }
}
class Accounts extends AbstractList {
  updateItem (id, item) {
    const from = this.list[id];
    super.updateItem(id, item);
    asafonov.messageBus.send(asafonov.events.ACCOUNT_UPDATED, {id: id, from: from, to: item});
  }
  updateId (id, newid) {
    super.updateId(id, newid);
    asafonov.messageBus.send(asafonov.events.ACCOUNT_RENAMED, {item: this.list[newid], from: id, to: newid});
  }
  purchase (id, amount) {
    this.updateItem(id, this.list[id] + amount);
  }
}
class MessageBus {
  constructor() {
    this.subscribers = {};
  }
  send (type, data) {
    if (this.subscribers[type] !== null && this.subscribers[type] !== undefined) {
      for (var i = 0; i < this.subscribers[type].length; ++i) {
        this.subscribers[type][i]['object'][this.subscribers[type][i]['func']](data);
      }
    }
  }
  subscribe (type, object, func) {
    if (this.subscribers[type] === null || this.subscribers[type] === undefined) {
      this.subscribers[type] = [];
    }
    this.subscribers[type].push({
      object: object,
      func: func
    });
  }
  unsubscribe (type, object, func) {
    for (var i = 0; i < this.subscribers[type].length; ++i) {
      if (this.subscribers[type][i].object === object && this.subscribers[type][i].func === func) {
        this.subscribers[type].slice(i, 1);
        break;
      }
    }
  }
  unsubsribeType (type) {
    delete this.subscribers[type];
  }
  destroy() {
    for (type in this.subscribers) {
      this.unsubsribeType(type);
    }
    this.subscribers = null;
  }
}
class Transactions {
  constructor (year, month) {
    const today = new Date();
    this.year = today.getFullYear() || year;
    this.month = asafonov.utils.padlen((today.getMonth() + 1 || month).toString(), 2, '0');
    this.name = this.year + this.month;
    this.initList();
  }
  initList() {
    if (this.list === null || this.list === undefined) {
      this.list = JSON.parse(window.localStorage.getItem(this.name)) || [];
    }
  }
  getList() {
    return this.list;
  }
  assignType (amount) {
    return amount >= 0 ? 'expense' : 'income';
  }
  createItem (date, account, amount, pos, tag, type) {
    return {
      date: date,
      account: account,
      amount: amount,
      pos: pos,
      tag: tag,
      type: type || this.assignType(amount)
    };
  }
  add (date, account, amount, pos, tag, type) {
    const item = this.createItem(date, account, amount, pos, tag, type);
    this.addItem(item);
  }
  addItem (item) {
    this.list.push(item);
    this.store();
    asafonov.messageBus.send(asafonov.events.TRANSACTION_UPDATED, {id: this.list.length - 1, to: item, from: null});
  }
  updateItem (id, item) {
    const oldItem = {...this.list[id]};
    this.list[id] = {...this.list[id], ...item};
    this.store();
    asafonov.messageBus.send(asafonov.events.TRANSACTION_UPDATED, {id: id, to: this.list[id], from: oldItem});
  }
  deleteItem (id) {
    this.list.splice(id, 1);
    this.store();
  }
  expense() {
    return this.sum(i => i.amount > 0);
  }
  income() {
    return Math.abs(this.sum(i => i.amount < 0));
  }
  sum (func) {
    return this.list.filter(v => func(v)).map(v => v.amount).reduce((accumulator, currentValue) => accumulator + currentValue, 0);
  }
  store() {
    window.localStorage.setItem(this.name, JSON.stringify(this.list));
  }
}
class Utils {
  displayMoney (money) {
    const dollars = parseInt(money / 100, 10);
    const cents = this.padlen((money % 100).toString(), 2, '0');
    return `${dollars}.${cents}`;
  }
  padlen (str, len, symbol) {
    for (let i = 0; i < len - str.length; ++i) {
      str = symbol + str;
    }
    return str;
  }
}
class AccountsController {
  constructor() {
    this.model = asafonov.accounts;
    asafonov.messageBus.subscribe(asafonov.events.TRANSACTION_UPDATED, this, 'onTransactionUpdated');
  }
  onTransactionUpdated (event) {
    const amountChanged = event.to.amount - (event.from !== null ? event.from.amount : 0);
    const accountChanged = event.from && event.to.account !== event.from.account;
    if (amountChanged != 0) {
      this.onAmountChanged(-amountChanged, event.to.account);
    }
    if (accountChanged) {
      this.onAccountChanged();
    }
  }
  onAmountChanged (amount, account) {
    this.model.purchase(account, amount);
  }
  onAccountChanged() {
  }
  destroy() {
    asafonov.messageBus.unsubscribe(asafonov.events.TRANSACTION_UPDATED, this, 'onTransactionUpdated');
  }
}
class AccountsView {
  constructor() {
    this.model = asafonov.accounts;
    this.onAddButtonClickedProxy = this.onAddButtonClicked.bind(this);
    this.onAccountTitleChangedProxy = this.onAccountTitleChanged.bind(this);
    this.onAccountValueChangedProxy = this.onAccountValueChanged.bind(this);
    this.listElement = document.querySelector('.accounts');
    this.addButton = this.listElement.querySelector('.add');
    this.addEventListeners();
  }
  addEventListeners() {
    this.updateEventListeners(true);
    asafonov.messageBus.subscribe(asafonov.events.ACCOUNT_UPDATED, this, 'onAccountUpdated');
    asafonov.messageBus.subscribe(asafonov.events.ACCOUNT_RENAMED, this, 'onAccountRenamed');
  }
  removeEventListeners() {
    this.updateEventListeners();
    asafonov.messageBus.unsubscribe(asafonov.events.ACCOUNT_UPDATED, this, 'onAccountUpdated');
    asafonov.messageBus.unsubscribe(asafonov.events.ACCOUNT_RENAMED, this, 'onAccountRenamed');
  }
  updateEventListeners (add) {
    this.addButton[add ? 'addEventListener' : 'removeEventListener']('click', this.onAddButtonClickedProxy);
  }
  onAddButtonClicked() {
    const accountName = 'Account' + Math.floor(Math.random() * 1000)
    this.model.updateItem(accountName, 0);
  }
  onAccountUpdated (event) {
    this.renderItem(event.id, event.to);
    this.updateTotal();
  }
  onAccountRenamed (event) {
    const oldId = this.genItemId(event.from);
    const newId = this.genItemId(event.to);
    document.querySelector(`#${oldId}`).id = newId;
    this.renderItem(event.to, event.item);
  }
  clearExistingItems() {
    const items = this.listElement.querySelectorAll('.item');
    for (let i = 0; i < items.length; ++i) {
      this.listElement.removeChild(items[i]);
    }
  }
  genItemId (name) {
    return `item_${name}`;
  }
  renderItem (name, amount) {
    let itemExists = true;
    const itemId = this.genItemId(name);
    let item = this.listElement.querySelector(`#${itemId}`);
    if (! item) {
      item = document.createElement('div');
      itemExists = false;
      item.id = itemId;
      item.className = 'item';
    }
    item.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'title';
    title.setAttribute('contenteditable', 'true');
    title.innerHTML = name;
    title.addEventListener('focus', event => event.currentTarget.setAttribute('data-content', event.currentTarget.innerText.replace(/\n/g, '')));
    title.addEventListener('blur', this.onAccountTitleChangedProxy);
    item.appendChild(title);
    const value = document.createElement('div');
    value.className = 'number';
    value.innerHTML = asafonov.utils.displayMoney(amount);
    value.setAttribute('contenteditable', 'true');
    value.addEventListener('focus', event => event.currentTarget.setAttribute('data-content', event.currentTarget.innerText.replace(/\n/g, '')));
    value.addEventListener('blur', this.onAccountValueChangedProxy);
    item.appendChild(value);
    if (! itemExists) {
      this.listElement.insertBefore(item, this.addButton);
    }
  }
  onAccountTitleChanged (event) {
    const title = event.currentTarget;
    const newValue = title.innerText.replace(/\n/g, '');
    const originalValue = title.getAttribute('data-content');
    if (newValue !== originalValue) {
      if (newValue.length > 0) {
        this.model.updateId(originalValue, newValue);
      } else {
        this.model.deleteItem(originalValue);
        this.updateList();
      }
    }
  }
  onAccountValueChanged (event) {
    const value = event.currentTarget;
    const title = value.parentNode.querySelector('.title');
    const newValue = value.innerText.replace(/\n/g, '');
    const originalValue = value.getAttribute('data-content');
    if (newValue !== originalValue) {
      const amount = parseInt(parseFloat(newValue) * 100);
      this.model.updateItem(title.innerHTML, amount);
    }
  }
  updateList() {
    this.clearExistingItems();
    const list = this.model.getList();
    this.updateTotal();
    for (let key in list) {
      this.renderItem(key, list[key]);
    }
  }
  updateTotal() {
    const list = this.model.getList();
    const totalElement = this.listElement.querySelector('.number.big');
    let total = 0;
    for (let key in list) {
      total += list[key];
    }
    totalElement.innerHTML = asafonov.utils.displayMoney(total);
  }
  destroy() {
    this.removeEventListeners();
    this.model.destroy();
    this.addButton = null;
    this.listElement = null;
  }
}
class TransactionsView {
  constructor() {
    this.listElement = document.querySelector('.transactions');
    this.addButton = this.listElement.querySelector('.add');
    this.incomeElement = document.querySelector('.income');
    this.expenseElement = document.querySelector('.expense');
    this.onAddButtonClickedProxy = this.onAddButtonClicked.bind(this);
    this.onAmountChangedProxy = this.onAmountChanged.bind(this);
    this.onItemDataChangedProxy = this.onItemDataChanged.bind(this);
    this.model = new Transactions();
    this.addEventListeners();
  }
  addEventListeners() {
    this.updateEventListeners(true);
    asafonov.messageBus.subscribe(asafonov.events.TRANSACTION_UPDATED, this, 'onTransactionUpdated');
  }
  removeEventListeners() {
    this.updateEventListeners();
    asafonov.messageBus.unsubscribe(asafonov.events.TRANSACTION_UPDATED, this, 'onTransactionUpdated');
  }
  updateEventListeners (add) {
    this.addButton[add ? 'addEventListener' : 'removeEventListener']('click', this.onAddButtonClickedProxy);
  }
  onTransactionUpdated (event) {
    this.renderItem (event.to, event.id);
    this.updateTotal();
  }
  onAddButtonClicked() {
    this.model.add(
      (new Date()).toISOString().substr(0, 10),
      asafonov.accounts.getDefault(),
      0,
      'Point of sale',
      'Groceries'
    );
  }
  updateTotal() {
    this.incomeElement.innerHTML = asafonov.utils.displayMoney(this.model.income());
    this.expenseElement.innerHTML = asafonov.utils.displayMoney(this.model.expense());
  }
  clearExistingItems() {
    const items = this.listElement.querySelectorAll('.item');
    for (let i = 0; i < items.length; ++i) {
      this.listElement.removeChild(items[i]);
    }
  }
  onAmountChanged (event) {
    const element = event.currentTarget;
    const newValue = element.innerText.replace(/\n/g, '');
    const originalValue = element.getAttribute('data-content');
    const id = element.parentNode.parentNode.getAttribute('data-id');
    if (newValue !== originalValue) {
      const amount = parseInt(parseFloat(newValue) * 100);
      this.model.updateItem(id, {amount: amount});
    }
  }
  onItemDataChanged (event) {
    const element = event.currentTarget;
    const newValue = element.innerText.replace(/\n/g, '');
    const originalValue = element.getAttribute('data-content');
    const id = element.parentNode.parentNode.getAttribute('data-id');
    const name = element.getAttribute('data-name');
    if (newValue !== originalValue) {
      let data = {};
      data[name] = newValue;
      this.model.updateItem(id, data);
    }
  }
  genItemId (id) {
    return `item_${id}`;
  }
  renderItem (item, i) {
    const itemId = this.genItemId(i);
    let itemDiv = this.listElement.querySelector(`#${itemId}`);
    let itemAdded = true;
    if (! itemDiv) {
      itemDiv = document.createElement('div');
      itemDiv.className = 'item';
      itemDiv.setAttribute('data-id', i);
      itemDiv.id = itemId;
      itemAdded = false;
    }
    itemDiv.innerHTML = '';
    const row1 = document.createElement('div');
    row1.className = 'row';
    const dateDiv = document.createElement('div');
    dateDiv.className = 'first_coll';
    dateDiv.innerHTML = item.date;
    row1.appendChild(dateDiv);
    const accountDiv = document.createElement('div');
    accountDiv.className = 'second_coll small';
    accountDiv.innerHTML = item.account;
    row1.appendChild(accountDiv);
    const amountDiv = document.createElement('div');
    amountDiv.className = 'third_coll number';
    amountDiv.innerHTML = asafonov.utils.displayMoney(item.amount);
    amountDiv.setAttribute('contenteditable', 'true');
    amountDiv.addEventListener('focus', event => event.currentTarget.setAttribute('data-content', event.currentTarget.innerText.replace(/\n/g, '')));
    amountDiv.addEventListener('blur', this.onAmountChangedProxy);
    row1.appendChild(amountDiv);
    itemDiv.appendChild(row1);
    const row2 = document.createElement('div');
    row2.className = 'row';
    const posDiv = document.createElement('div');
    posDiv.className = 'first_coll small';
    posDiv.innerHTML = item.pos;
    posDiv.setAttribute('data-name', 'pos');
    posDiv.setAttribute('contenteditable', 'true');
    posDiv.addEventListener('focus', event => event.currentTarget.setAttribute('data-content', event.currentTarget.innerText.replace(/\n/g, '')));
    posDiv.addEventListener('blur', this.onItemDataChangedProxy);
    row2.appendChild(posDiv);
    const tagDiv = document.createElement('div');
    tagDiv.className = 'second_coll small';
    tagDiv.innerHTML = item.tag;
    tagDiv.setAttribute('data-name', 'tag');
    tagDiv.setAttribute('contenteditable', 'true');
    tagDiv.addEventListener('focus', event => event.currentTarget.setAttribute('data-content', event.currentTarget.innerText.replace(/\n/g, '')));
    tagDiv.addEventListener('blur', this.onItemDataChangedProxy);
    row2.appendChild(tagDiv);
    const icoDiv = document.createElement('div');
    icoDiv.className = 'third_coll ico_container';
    row2.appendChild(icoDiv);
    const ico = document.createElement('div');
    ico.className = 'svg';
    ico.classList.add('trans_' + item.type);
    icoDiv.appendChild(ico);
    itemDiv.appendChild(row2);
    if (! itemAdded) this.listElement.insertBefore(itemDiv, this.addButton);
  }
  updateList() {
    this.clearExistingItems();
    this.updateTotal();
    const list = this.model.getList();
    for (let i = 0; i < list.length; ++i) {
      this.renderItem(list[i], i);
    }
  }
  destroy() {
    this.removeEventListeners();
    this.model.destroy();
    this.addButton = null;
    this.listElement = null;
    this.incomeElement = null;
    this.expenseElement = null;
  }
}
window.asafonov = {};
window.asafonov.utils = new Utils();
window.asafonov.messageBus = new MessageBus();
window.asafonov.events = {
  ACCOUNT_UPDATED: 'accountUpdated',
  ACCOUNT_RENAMED: 'accountRenamed',
  TRANSACTION_UPDATED: 'transactionUpdated'
};
window.asafonov.settings = {
};
document.addEventListener("DOMContentLoaded", function (event) {
  asafonov.accounts = new Accounts(
    {Account1: 300000, Account2: 4142181} // test data
  )
  const accountsController = new AccountsController();
  const accountsView = new AccountsView();
  accountsView.updateList();
  const transactionsView = new TransactionsView();
  transactionsView.updateList();
});