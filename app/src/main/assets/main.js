class AbstractList {
  constructor (list) {
    this.list = this.getList() || {}
    if (list) this.list = {...list, ...this.list}
  }
  getList() {
    if (this.list === null || this.list === undefined) {
      this.list = JSON.parse(window.localStorage.getItem(this.constructor.name))
    }
    return this.list
  }
  length() {
    return Object.keys(this.list).length
  }
  getDefault() {
    return Object.keys(this.list)[0]
  }
  getItem (id) {
    if (this.list === null || this.list === undefined) {
      this.getList()
    }
    return this.list[id]
  }
  updateItem (id, item) {
    this.list[id] = item
    this.store()
  }
  updateId (id, newid) {
    this.list[newid] = this.list[id]
    this.deleteItem(id)
  }
  deleteItem (id) {
    delete this.list[id]
    this.store()
  }
  store() {
    window.localStorage.setItem(this.constructor.name, JSON.stringify(this.list))
  }
}
class AbstractPeriodList {
  constructor (year, month, prefix, event) {
    const today = new Date();
    this.year = year || today.getFullYear();
    this.month = asafonov.utils.padlen((month || today.getMonth() + 1).toString(), 2, '0');
    this.name = prefix + this.year + this.month;
    this.initList(event);
  }
  initList (event) {
    if (this.list === null || this.list === undefined) {
      this.list = JSON.parse(window.localStorage.getItem(this.name)) || [];
      if (event) asafonov.messageBus.send(event, {list: this});
    }
  }
  length() {
    return this.list.length;
  }
  getList() {
    return this.list;
  }
  getItem (id) {
    return this.list[id];
  }
  addItem (item, event) {
    this.list.push(item);
    this.store();
    if (event) asafonov.messageBus.send(event, {id: this.list.length - 1, to: item, from: null});
  }
  updateItem (id, item, event) {
    const oldItem = {...this.list[id]};
    this.list[id] = {...this.list[id], ...item};
    this.store();
    if (event) asafonov.messageBus.send(event, {id: id, to: this.list[id], from: oldItem});
  }
  deleteItem (id) {
    this.list.splice(id, 1);
    this.store();
  }
  store() {
    window.localStorage.setItem(this.name, JSON.stringify(this.list));
  }
  clear() {
    window.localStorage.removeItem(this.name);
    this.list = [];
  }
  destroy() {
    this.year = null;
    this.month = null;
    this.name = null;
    this.list = null;
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
  getDefault() {
    const settings = asafonov.settings
    const defaultAccount = settings.getItem('default_account')
    return defaultAccount || super.getDefault()
  }
}
class Backup {
  clear() {
    window.localStorage.clear()
  }
  backup (hostname) {
    const list = {...window.localStorage}
    fetch('http://' + hostname + ':9092/monly', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(list)
    })
    .then(() => {
      alert("Backup completed")
    })
    .catch(error => alert(error.message))
  }
  restore (hostname) {
    return fetch('http://' + hostname + ':9092/data/monly')
    .then(data => data.json())
    .then(data => {
      this.clear()
      for (let i in data) {
        window.localStorage.setItem(i, data[i])
      }
    })
    .catch(error => alert(error.message))
  }
  destroy() {
  }
}
class Budgets extends AbstractList {
  updateItem (id, item) {
    const from = this.list[id];
    super.updateItem(id, Math.round(parseFloat(item) * 100));
    asafonov.messageBus.send(asafonov.events.BUDGET_UPDATED, {id: id, from: from, to: item});
  }
  updateId (id, newid) {
    super.updateId(id, newid);
    asafonov.messageBus.send(asafonov.events.BUDGET_RENAMED, {item: this.list[newid], from: id, to: newid});
  }
}
class Currency {
  buildUrl (base, symbol) {
    return `https://api.exchangerate.host/lates?base=${base}&symbols=${symbol}`
  }
  parseResponse (data, symbol) {
    return data.rates[symbol]
  }
  getFromCache (base, symbol) {
    const k = `currency_${base}${symbol}`
    const cache = JSON.parse(window.localStorage.getItem(k)) || {}
    const t = cache.t || 0
    const now = new Date().getTime()
    if (t + 12 * 3600 * 1000 > now) {
      return [cache.value, cache.value]
    }
    return [null, cache.value || 1]
  }
  saveToCache (base, symbol, value) {
    const cache = {
      t: new Date().getTime(),
      value: value
    }
    const k = `currency_${base}${symbol}`
    window.localStorage.setItem(k, JSON.stringify(cache))
  }
  async convert (base, symbol) {
    let [ret, cache] = this.getFromCache(base, symbol)
    if (ret) return ret
    const url = this.buildUrl(base, symbol)
    try {
      const response = await fetch(url)
      const data = await response.json()
      ret = this.parseResponse(data, symbol)
      if (ret) this.saveToCache(base, symbol, ret)
    } catch (e) {}
    return ret || cache || 1
  }
  trim (value) {
    return this.isRateNeeded(value) ? value.substr(0, 6) : parseFloat(value)
  }
  isRateNeeded (rateValue) {
    return typeof rateValue === 'string' && rateValue.length >= 6 && rateValue.match(/[A-z]/g)
  }
  async initRate (rateValue) {
    if (this.isRateNeeded(rateValue)) {
      const base = rateValue.substr(0, 3)
      const symbol = rateValue.substr(3)
      const rate = await this.convert(base, symbol)
      return parseFloat(rate)
    } else {
      return parseFloat(rateValue) || 1
    }
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
class Reports extends AbstractPeriodList {
  constructor (year, month) {
    super(year, month, 'reports_');
  }
  build (removeSource) {
    const transactions = new Transactions(this.year, this.month);
    if (transactions.length() === 0) {
      transactions.destroy();
      return;
    }
    this.clear();
    const tags = new Set(transactions.getList().map(i => i.tag.trim()));
    let item = {};
    for (let i of tags) {
      const sumByTag = transactions.sumByTag(i);
      item[i] = sumByTag
    }
    this.addItem(item);
    if (removeSource) transactions.clear();
    transactions.destroy();
  }
}
class Settings extends AbstractList {
  constructor (list) {
    super({
      mainscreen: {
        accounts: true,
        review: true,
        budget: true,
        transactions: true
      },
      default_account: null,
      account_rate: {},
      categories: ['Groceries', 'Transport', 'Travel', 'Utilities', 'Gas', 'Health', 'Fun', 'Presents', 'Clothes']
    })
  }
  async initCurrencyRates() {
    const currency = new Currency()
    for (let k in this.list.account_rate) {
      const rate = await currency.initRate(this.list.account_rate[k])
      this.list.account_rate[k] = rate
    }
  }
}
class Transactions extends AbstractPeriodList {
  constructor (year, month) {
    super(year, month, 'transactions_', asafonov.events.TRANSACTIONS_LOADED)
  }
  assignType (amount) {
    return amount >= 0 ? 'expense' : 'income'
  }
  createItem (date, account, amount, pos, tag, type) {
    return {
      date: date,
      account: account,
      amount: amount,
      pos: pos,
      tag: tag,
      type: type || this.assignType(amount)
    }
  }
  add (date, account, amount, pos, tag, type) {
    const item = this.createItem(date, account, amount, pos, tag, type)
    this.addItem(item)
  }
  addItem (item) {
    super.addItem(item, asafonov.events.TRANSACTION_UPDATED)
  }
  updateItem (id, item) {
    if (item.amount !== undefined && item.amount !== null) {
      item.type = this.assignType(item.amount)
      item.amount = Math.round(parseFloat(item.amount) * 100)
    }
    super.updateItem(id, item, asafonov.events.TRANSACTION_UPDATED)
  }
  deleteItem (id) {
    super.deleteItem(id)
  }
  getSumsByTags() {
    const tags = {}
    const accountRate = asafonov.settings.getItem('account_rate')
    for (let i = 0; i < this.list.length; ++i) {
      const tag = this.list[i].tag.trim()
      tags[tag] = (tags[tag] || 0) + this.list[i].amount * (accountRate[this.list[i].account] || 1)
    }
    return tags
  }
  income() {
    const tags = this.getSumsByTags()
    let sum = 0
    for (let i in tags) {
      sum += tags[i] < 0 ? -1 * tags[i] : 0
    }
    return sum
  }
  expense() {
    const tags = this.getSumsByTags()
    let sum = 0
    for (let i in tags) {
      sum += tags[i] > 0 ? tags[i] : 0
    }
    return sum
  }
  sumByTag (tag) {
    return this.sum(i => i.tag.trim() === tag)
  }
  sum (func) {
    const accountRate = asafonov.settings.getItem('account_rate')
    return this.list.filter(v => func(v)).map(v => v.amount * (accountRate[v.account] || 1)).reduce((accumulator, currentValue) => accumulator + currentValue, 0)
  }
}
class Updater {
  constructor (upstreamVersionUrl) {
    this.upstreamVersionUrl = upstreamVersionUrl
  }
  getCurrentVersion() {
    return window.asafonov.version
  }
  getUpstreamVersion() {
    return fetch(this.upstreamVersionUrl)
      .then(data => data.text())
      .then(data => data.replace(/[^0-9\.]/g, ''))
  }
  compareVersion (v1, v2) {
    const _v1 = v1.split('.')
    const _v2 = v2.split('.')
    let ret = false
    for (let i = 0; i < _v1.length; ++i) {
      if (parseInt(_v1[i], 10) > parseInt(_v2[i], 10)) {
        ret = true
        break
      }
    }
    return ret
  }
  getUpdateUrl (template) {
    return template.replace('{VERSION}', this.upstreamVersion)
  }
  isUpdateNeeded() {
    return this.getUpstreamVersion().
      then(upstreamVersion => {
        this.upstreamVersion = upstreamVersion
        const currentVersion = this.getCurrentVersion()
        return this.compareVersion(upstreamVersion, currentVersion)
      })
  }
}
class Utils {
  displayMoney (money) {
    money = parseInt(money, 10)
    const dollars = parseInt(money / 100, 10);
    const cents = this.padlen((Math.abs(money) % 100).toString(), 2, '0');
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
      this.onAccountChanged(event.from.account, event.to.account, event.to.amount);
    }
  }
  onAmountChanged (amount, account) {
    this.model.purchase(account, amount);
  }
  onAccountChanged (from, to, amount) {
    this.model.purchase(from, amount);
    this.model.purchase(to, -amount);
  }
  destroy() {
    asafonov.messageBus.unsubscribe(asafonov.events.TRANSACTION_UPDATED, this, 'onTransactionUpdated');
  }
}
class ReportsController {
  buildOnDate (year, month, removeSource) {
    const reports = new Reports(year, month, removeSource);
    reports.build(removeSource);
    reports.destroy();
  }
  build() {
    let d = new Date();
    let month = d.getMonth()
    let year = d.getFullYear()
    if (month == 0) {
      month = 12
      year -= 1
    }
    this.buildOnDate(year, month, true);
  }
  availableReports() {
    const availableReportsKeys = Object.keys(window.localStorage).filter(i => i.substr(0, 8) === 'reports_').map(i => i.substr(8))
    return availableReportsKeys
  }
  destroy() {}
}
class AccountsView {
  constructor() {
    this.listElement = document.querySelector('.accounts')
    this.settings = asafonov.settings
    const mainscreen = this.settings.getItem('mainscreen')
    const isEnabled = mainscreen.accounts
    this.model = asafonov.accounts
    if (! isEnabled) {
      this.listElement.parentNode.removeChild(this.listElement)
      return
    }
    this.onAddButtonClickedProxy = this.onAddButtonClicked.bind(this)
    this.onAccountTitleChangedProxy = this.onAccountTitleChanged.bind(this)
    this.onAccountValueChangedProxy = this.onAccountValueChanged.bind(this)
    this.addButton = this.listElement.querySelector('.add_link')
    this.addEventListeners()
  }
  addEventListeners() {
    this.updateEventListeners(true)
    asafonov.messageBus.subscribe(asafonov.events.ACCOUNT_UPDATED, this, 'onAccountUpdated')
    asafonov.messageBus.subscribe(asafonov.events.ACCOUNT_RENAMED, this, 'onAccountRenamed')
  }
  removeEventListeners() {
    this.updateEventListeners()
    asafonov.messageBus.unsubscribe(asafonov.events.ACCOUNT_UPDATED, this, 'onAccountUpdated')
    asafonov.messageBus.unsubscribe(asafonov.events.ACCOUNT_RENAMED, this, 'onAccountRenamed')
  }
  updateEventListeners (add) {
    this.addButton[add ? 'addEventListener' : 'removeEventListener']('click', this.onAddButtonClickedProxy)
  }
  onAddButtonClicked() {
    const accountName = 'Account' + Math.floor(Math.random() * 1000)
    this.model.updateItem(accountName, 0)
  }
  onAccountUpdated (event) {
    this.renderItem(event.id, event.to)
    this.updateTotal()
  }
  onAccountRenamed (event) {
    const oldId = this.genItemId(event.from)
    const newId = this.genItemId(event.to)
    document.querySelector(`#${oldId}`).id = newId
    this.renderItem(event.to, event.item)
  }
  clearExistingItems() {
    const items = this.listElement.querySelectorAll('.section_row')
    for (let i = 0; i < items.length; ++i) {
      this.listElement.removeChild(items[i])
    }
    const underlines = this.listElement.querySelectorAll('.underline')
    for (let i = 0; i < underlines.length; ++i) {
      this.listElement.removeChild(underlines[i])
    }
  }
  genItemId (name) {
    return `item_${name}`
  }
  renderItem (name, amount) {
    let itemExists = true
    const itemId = this.genItemId(name)
    let item = this.listElement.querySelector(`#${itemId}`)
    if (! item) {
      item = document.createElement('div')
      itemExists = false
      item.id = itemId
      item.className = 'section_row'
    }
    item.innerHTML = ''
    const title = document.createElement('p')
    title.className = 'title'
    title.setAttribute('contenteditable', 'true')
    title.innerHTML = name
    title.addEventListener('focus', event => event.currentTarget.setAttribute('data-content', event.currentTarget.innerText.replace(/\n/g, '')))
    title.addEventListener('blur', this.onAccountTitleChangedProxy)
    item.appendChild(title)
    const value = document.createElement('p')
    value.className = 'number'
    value.innerHTML = asafonov.utils.displayMoney(amount)
    value.setAttribute('contenteditable', 'true')
    value.addEventListener('focus', event => event.currentTarget.setAttribute('data-content', event.currentTarget.innerText.replace(/\n/g, '')))
    value.addEventListener('blur', this.onAccountValueChangedProxy)
    item.appendChild(value)
    if (! itemExists) {
      this.listElement.insertBefore(item, this.addButton)
      const underline = document.createElement('div')
      underline.className = 'underline'
      this.listElement.insertBefore(underline, this.addButton)
    }
  }
  onAccountTitleChanged (event) {
    const title = event.currentTarget
    const newValue = title.innerText.replace(/\n/g, '')
    const originalValue = title.getAttribute('data-content')
    if (newValue !== originalValue) {
      if (newValue.length > 0) {
        this.model.updateId(originalValue, newValue)
      } else {
        this.model.deleteItem(originalValue)
        this.updateList()
      }
    }
  }
  onAccountValueChanged (event) {
    const value = event.currentTarget
    const title = value.parentNode.querySelector('.title')
    const newValue = value.innerText.replace(/\n/g, '')
    const originalValue = value.getAttribute('data-content')
    if (newValue !== originalValue) {
      const amount = Math.round(parseFloat(newValue) * 100)
      this.model.updateItem(title.innerHTML, amount)
    }
  }
  updateList() {
    this.clearExistingItems()
    const list = this.model.getList()
    this.updateTotal()
    for (let key in list) {
      this.renderItem(key, list[key])
    }
  }
  updateTotal() {
    const list = this.model.getList()
    const totalElement = this.listElement.querySelector('h2')
    let total = 0
    const accountRate = this.settings.getItem('account_rate')
    for (let key in list) {
      total += list[key] * (accountRate[key] || 1)
    }
    totalElement.innerHTML = asafonov.utils.displayMoney(total)
  }
  destroy() {
    this.removeEventListeners()
    this.model.destroy()
    this.addButton = null
    this.listElement = null
  }
}
class BackupView {
  constructor() {
    this.model = new Backup()
    this.mainContainer = document.querySelector('.settings-backup')
    this.clearButton = this.mainContainer.querySelector('.clear')
    this.backupButton = this.mainContainer.querySelector('.backup')
    this.restoreButton = this.mainContainer.querySelector('.restore')
    this.onClearButtonClickedProxy = this.onClearButtonClicked.bind(this)
    this.onBackupButtonClickedProxy = this.onBackupButtonClicked.bind(this)
    this.onRestoreButtonClickedProxy = this.onRestoreButtonClicked.bind(this)
    this.addEventListeners()
  }
  addEventListeners() {
    this.updateEventListeners(true)
  }
  removeEventListeners() {
    this.updateEventListeners()
  }
  updateEventListeners (add) {
    this.clearButton[add ? 'addEventListener' : 'removeEventListener']('click', this.onClearButtonClickedProxy)
    this.backupButton[add ? 'addEventListener' : 'removeEventListener']('click', this.onBackupButtonClickedProxy)
    this.restoreButton[add ? 'addEventListener' : 'removeEventListener']('click', this.onRestoreButtonClickedProxy)
  }
  onClearButtonClicked() {
    if (confirm('Are you sure you want to clear App data? This can\'t be undone')) {
      this.model.clear()
      location.reload()
    }
  }
  getHostname() {
    const hostname = prompt('Hostname', window.localStorage.getItem('hostname') || '192.168.0.1')
    hostname && window.localStorage.setItem('hostname', hostname)
    return hostname
  }
  onBackupButtonClicked() {
    const hostname = this.getHostname()
    hostname && this.model.backup(hostname)
  }
  onRestoreButtonClicked() {
    const hostname = this.getHostname()
    hostname && this.model.restore(hostname)
                .then(() => {
                  alert('Data restored')
                  location.reload()
                })
  }
  destroy() {
    this.removeEventListeners()
    this.model.destroy()
    this.clearButton = null
    this.mainContainer = null
  }
}
class BudgetsView {
  constructor() {
    this.listElement = document.querySelector('.budgets')
    const settings = asafonov.settings
    const mainscreen = settings.getItem('mainscreen')
    const isEnabled = mainscreen.budget
    this.model = new Budgets()
    if (! isEnabled) {
      this.listElement.parentNode.removeChild(this.listElement)
      return
    }
    this.transactions = null
    this.onAddButtonClickedProxy = this.onAddButtonClicked.bind(this)
    this.onTitleChangedProxy = this.onTitleChanged.bind(this)
    this.onValueChangedProxy = this.onValueChanged.bind(this)
    this.addButton = this.listElement.querySelector('.add_link')
    this.totalElement = this.listElement.querySelector('.total')
    this.addEventListeners()
    this.updateCateories()
  }
  updateCateories() {
    this.categories = asafonov.settings.getItem('categories')
  }
  addEventListeners() {
    this.updateEventListeners(true)
  }
  removeEventListeners() {
    this.updateEventListeners()
  }
  updateEventListeners (add) {
    this.addButton[add ? 'addEventListener' : 'removeEventListener']('click', this.onAddButtonClickedProxy)
    asafonov.messageBus[add ? 'subscribe' : 'unsubscribe'](asafonov.events.BUDGET_UPDATED, this, 'onBudgetUpdated')
    asafonov.messageBus[add ? 'subscribe' : 'unsubscribe'](asafonov.events.BUDGET_RENAMED, this, 'onBudgetRenamed')
    asafonov.messageBus[add ? 'subscribe' : 'unsubscribe'](asafonov.events.TRANSACTIONS_LOADED, this, 'onTransactionsLoaded')
    asafonov.messageBus[add ? 'subscribe' : 'unsubscribe'](asafonov.events.TRANSACTION_UPDATED, this, 'onTransactionUpdated')
  }
  onAddButtonClicked() {
    const name = 'Groceries'
    this.model.updateItem(name, 0)
  }
  onBudgetUpdated (event) {
    this.renderItem(event.id, event.to)
    this.updateBudgetCompletion(event.id)
    this.updateTotal()
  }
  onBudgetRenamed (event) {
    const oldId = this.genItemId(event.from)
    const newId = this.genItemId(event.to)
    document.querySelector(`#${oldId}`).id = newId
    this.renderItem(event.to, event.item)
    this.updateBudgetCompletion(event.to)
  }
  onTransactionsLoaded (event) {
    if (this.transactions !== null && this.transactions !== undefined) return
    const list = this.model.getList()
    this.transactions = event.list
    this.updateTotal()
    for (let tag in list) {
      this.updateBudgetCompletion(tag)
    }
  }
  onTransactionUpdated (event) {
    let affectedTags = [event.to.tag]
    event.from && event.from.tag !== event.to.tag && (affectedTags.push(event.from.tag))
    for (let i = 0; i < affectedTags.length; ++i) {
      if (this.model.getItem(affectedTags[i]) !== undefined) {
        this.updateBudgetCompletion(affectedTags[i])
        this.updateTotal()
      }
    }
  }
  updateBudgetCompletion (tag) {
    const sum = this.transactions.sumByTag(tag)
    const itemId = this.genItemId(tag)
    const item = this.listElement.querySelector(`#${itemId}`)
    const budget = asafonov.utils.displayMoney(this.model.getItem(tag))
    const left = asafonov.utils.displayMoney(this.model.getItem(tag) - sum)
    const spent = asafonov.utils.displayMoney(sum)
    item.querySelector(`.number.left`).innerHTML = left
    item.querySelectorAll('.budget_row .number span')[0].innerText = `${spent} / `
    item.querySelectorAll('.budget_row .number span')[1].innerText = budget
    const width = Math.min(100, parseInt(sum / this.model.getItem(tag) * 100))
    item.querySelector('.budget_fill').style.width = `${width}%`
  }
  clearExistingItems() {
    const items = this.listElement.querySelectorAll('.item')
    for (let i = 0; i < items.length; ++i) {
      this.listElement.removeChild(items[i])
    }
  }
  genItemId (name) {
    return `budget_${name}`
  }
  renderItem (name, amount) {
    let itemExists = true
    const itemId = this.genItemId(name)
    let item = this.listElement.querySelector(`#${itemId}`)
    if (! item) {
      item = document.createElement('div')
      itemExists = false
      item.id = itemId
      item.className = 'item'
    }
    item.innerHTML = ''
    const displayAmount = asafonov.utils.displayMoney(amount)
    const displayZero = asafonov.utils.displayMoney(0)
    const row1 = document.createElement('div')
    row1.className = 'section_row'
    const nameEl = document.createElement('select')
    for (let i = 0; i < this.categories.length; ++i) {
      const opt = document.createElement('option')
      opt.value = this.categories[i]
      opt.text = this.categories[i]
      this.categories[i] === name && (opt.setAttribute('selected', true))
      nameEl.appendChild(opt)
    }
    nameEl.className = 'budget_name'
    nameEl.addEventListener('change', this.onTitleChangedProxy)
    nameEl.addEventListener('focus', event => event.currentTarget.setAttribute('data-value', event.currentTarget.value))
    row1.appendChild(nameEl)
    const amountEl = document.createElement('p')
    amountEl.className = 'number left'
    amountEl.innerHTML = displayZero
    row1.appendChild(amountEl)
    item.appendChild(row1)
    const row2 = document.createElement('div')
    row2.className = 'budget_row'
    const numberEl = document.createElement('p')
    numberEl.className = 'number'
    const span1 = document.createElement('span')
    span1.innerHTML = displayZero + ' / '
    numberEl.appendChild(span1)
    const span2 = document.createElement('span')
    span2.innerHTML = displayAmount
    span2.addEventListener('blur', this.onValueChangedProxy)
    span2.setAttribute('contenteditable', true)
    numberEl.appendChild(span2)
    row2.appendChild(numberEl)
    const budgetLine = document.createElement('div')
    budgetLine.className = 'budget_line'
    const budgetFill = document.createElement('div')
    budgetFill.className = 'budget_fill'
    budgetLine.appendChild(budgetFill)
    row2.appendChild(budgetLine)
    item.appendChild(row2)
    if (! itemExists) {
      this.listElement.insertBefore(item, this.addButton)
    }
  }
  onTitleChanged (event) {
    const newValue = event.currentTarget.value
    const originalValue = event.currentTarget.getAttribute('data-value')
    if (newValue !== originalValue) {
      if (newValue.length > 0) {
        this.model.updateId(originalValue, newValue)
      } else {
        this.model.deleteItem(originalValue)
        this.updateList()
      }
    }
  }
  onValueChanged (event) {
    const value = event.currentTarget
    const title = value.parentNode.parentNode.parentNode.querySelector('.budget_name').value
    const newValue = value.innerText.replace(/\n/g, '')
    this.model.updateItem(title, newValue)
  }
  updateList() {
    this.clearExistingItems()
    const list = this.model.getList()
    for (let key in list) {
      this.renderItem(key, list[key])
    }
  }
  updateTotal() {
    const list = this.model.getList()
    let total = 0
    for (let key in list) {
      total += list[key] - this.transactions.sumByTag(key)
    }
    this.totalElement.innerHTML = asafonov.utils.displayMoney(total)
  }
  destroy() {
    this.removeEventListeners()
    this.model.destroy()
    this.addButton = null
    this.listElement = null
    this.totalElement = null
  }
}
class ReportsView {
  constructor() {
    this.model = new Reports()
    this.controller = new ReportsController()
    this.circleLen = 30 * 0.42 * 2 * Math.PI
    this.popup = document.querySelector('.select')
    this.options = this.popup.querySelector('.options')
    this.active = this.popup.querySelector('.active')
    this.togglePopupProxy = this.togglePopup.bind(this)
    this.addEventListeners()
    this.initAvailableReports()
  }
  initAvailableReports() {
    const availableReports = this.controller.availableReports()
    const availableReportsMap = {}
    for (let i = 0; i < availableReports.length; ++i) {
      availableReportsMap[availableReports[i]] = true
    }
    const year = new Date().getFullYear()
    this.options.querySelector('.year').innerHTML = year
    for (let i = 1; i < 13; ++i) {
      const m = asafonov.utils.padlen(i + '', 2, '0')
      const c = `.m${m}`
      const k = `${year}${m}`
      const isReportAvailable = availableReportsMap[k]
      const month = this.options.querySelector(c)
      month.style.display = isReportAvailable ? 'block' : 'none'
      if (isReportAvailable) {
        month.addEventListener('click', () => this.loadReport(m, year))
      }
    }
  }
  loadReport (m, y) {
    this.model.destroy()
    this.model = new Reports(y, m)
    this.show()
    this.togglePopup()
    this.active.innerHTML = this.options.querySelector(`.m${m}`).innerHTML + ' ' + y
  }
  addEventListeners() {
    this.active.addEventListener('click', this.togglePopupProxy)
  }
  removeEventListeners() {
    this.active.removeEventListener('click', this.togglePopupProxy)
  }
  togglePopup() {
    this.popup.classList.toggle('monly-popup')
  }
  clearExistingItems() {
    const items = this.element.querySelectorAll('.item')
    for (let i = 0; i < items.length; ++i) {
      this.element.removeChild(items[i])
    }
  }
  showExpenses() {
    this.element = document.querySelector('.expenses.monly-circle')
    this.circleElement = this.element.querySelector('.donut.chart svg')
    this.totalElement = this.element.querySelector('.number.big')
    this.donutElement = this.element.querySelector('.donut.chart')
    this.showChart(i => i > 0)
  }
  showIncome() {
    this.element = document.querySelector('.income.monly-circle')
    this.circleElement = this.element.querySelector('.donut.chart svg')
    this.totalElement = this.element.querySelector('.number.big')
    this.donutElement = this.element.querySelector('.donut.chart')
    this.showChart(i => i < 0)
  }
  show() {
    this.showExpenses()
    this.showIncome()
  }
  showChart (proceedFunction) {
    this.circleElement.innerHTML = ''
    this.clearExistingItems()
    this.model.build()
    const data = this.model.getItem(0)
    const subtotal = Object.values(data).filter(proceedFunction).reduce((accumulator, currentValue) => accumulator + currentValue, 0)
    const total = Math.abs(subtotal)
    let i = 1
    let offset = 0
    this.totalElement.innerHTML = asafonov.utils.displayMoney(total)
    const keys = Object.keys(data)
    keys.sort((a, b) => Math.abs(data[a]) - Math.abs(data[b]))
    for (let item of keys) {
      if (! proceedFunction(data[item])) continue
      const value = Math.abs(data[item])
      const lineLen = value / total * this.circleLen
      const spaceLen = this.circleLen - lineLen
      const circle = document.createElement('circle')
      circle.className = `slice_${i}`
      circle.style.strokeDasharray = `${lineLen} ${spaceLen}`
      circle.style.strokeDashoffset = offset
      this.circleElement.innerHTML += circle.outerHTML
      const itemDiv = document.createElement('div')
      itemDiv.className = 'item'
      itemDiv.innerHTML = `<div><span class="bullet slice_${i}"></span>${item}</div>`
      const displayMoney = asafonov.utils.displayMoney(value)
      itemDiv.innerHTML += `<div class="number">${displayMoney}</div>`
      this.donutElement.after(itemDiv)
      offset -= lineLen
      i = i % 11 + 1
    }
    const circle = document.createElement('circle')
    circle.className = 'slice_f'
    this.circleElement.innerHTML += circle.outerHTML
  }
  destroy() {
    this.model.destroy()
    this.controller.destroy()
    this.removeEventListeners()
  }
}
class SettingsView {
  constructor() {
    this.model = asafonov.settings
    this.mainScreen = document.querySelector('.settings-mainscreen')
    this.defaultAccountScreen = document.querySelector('.settings-default-account')
    this.accountRateScreen = document.querySelector('.settings-account-rate')
    this.categoriesScreen = document.querySelector('.settings-categories')
  }
  showMainScreen() {
    this.mainScreen.innerHTML = '<h1>main screen</h1>'
    const items = this.model.getItem('mainscreen')
    for (let i in items) {
      const div = document.createElement('div')
      div.className = 'item'
      div.innerHTML = `<div>${i}</div>`
      div.setAttribute('data-value', i)
      items[i] && div.classList.add('set')
      this.mainScreen.appendChild(div)
      div.addEventListener('click', event => {
        const target = event.target.parentNode
        const value = target.getAttribute('data-value')
        items[value] = ! items[value]
        if (items[value]) {
          target.classList.add('set')
        } else {
          target.classList.remove('set')
        }
        this.model.updateItem('mainscreen', items)
      })
    }
  }
  showDefaultAccountScreen() {
    this.defaultAccountScreen.innerHTML = '<h1>default account</h1>'
    const accounts = asafonov.accounts.getList()
    const defaultAccount = this.model.getItem('default_account')
    for (let i in accounts) {
      const div = document.createElement('div')
      div.className = 'item accounts-item'
      div.innerHTML = `<div>${i}</div>`
      div.setAttribute('data-value', i)
      defaultAccount === i && div.classList.add('set')
      this.defaultAccountScreen.appendChild(div)
      div.addEventListener('click', event => {
        const target = event.target.parentNode
        const value = target.getAttribute('data-value')
        const items = document.querySelectorAll('.accounts-item')
        for (let i = 0; i < items.length; ++i) {
          items[i].classList.remove('set')
        }
        target.classList.add('set')
        this.model.updateItem('default_account', value)
      })
    }
  }
  showAccountRateScreen() {
    this.accountRateScreen.innerHTML = '<h1>account rates</h1>'
    const accounts = asafonov.accounts.getList()
    const currency = new Currency()
    for (let i in accounts) {
      const div = document.createElement('div')
      div.className = 'item accounts-item'
      div.innerHTML = `<div>${i}</div>`
      this.accountRateScreen.appendChild(div)
      div.addEventListener('click', async event => {
        const accountRate = this.model.getItem('account_rate') || {}
        const isRateNeeded = currency.isRateNeeded(accountRate[i])
        const newRate = prompt('Please enter the account rate', (accountRate[i] || await currency.initRate(accountRate[i])) + (isRateNeeded ? ` (${await currency.initRate(accountRate[i])})` : ''))
        if (newRate) {
          accountRate[i] = currency.trim(newRate)
          this.model.updateItem('account_rate', accountRate)
        }
      })
    }
  }
  showCategoriesScreen() {
    this.categoriesScreen.innerHTML = '<h1>categories</h1>'
    const items = this.model.getItem('categories')
    for (let i of items) {
      const div = document.createElement('div')
      div.className = 'item'
      div.innerHTML = `<div>${i}</div>`
      this.categoriesScreen.appendChild(div)
      div.addEventListener('click', () => {
        if (confirm(`Delete category "${i}"?`)) {
          items.splice(items.indexOf(i), 1)
          this.model.updateItem('categories', items)
          this.showCategoriesScreen()
        }
      })
    }
    const addButton = document.createElement('div')
    addButton.className = 'add'
    addButton.innerHTML = 'add category'
    this.categoriesScreen.appendChild(addButton)
    addButton.addEventListener('click', () => {
      const category = prompt('Enter the category name:')
      if (category) {
        items.push(category)
        this.model.updateItem('categories', items)
        this.showCategoriesScreen()
      }
    })
  }
  show() {
    this.showMainScreen()
    this.showDefaultAccountScreen()
    this.showAccountRateScreen()
    this.showCategoriesScreen()
  }
}
class TransactionsView {
  constructor() {
    this.reviewElement = document.querySelector('.review')
    const settings = asafonov.settings
    const mainscreen = settings.getItem('mainscreen')
    this.isReviewEnabled = mainscreen.review
    if (! this.isReviewEnabled) {
      this.reviewElement.parentNode.removeChild(this.reviewElement)
    }
    this.model = new Transactions()
    this.listElement = document.querySelector('.transactions')
    this.isTransactionsEnabled = mainscreen.transactions
    if (! this.isTransactionsEnabled) {
      this.listElement.parentNode.removeChild(this.listElement)
      return
    }
    this.headerElement = this.listElement.querySelector('h1').parentNode
    this.addButton = this.listElement.querySelector('.add_link')
    this.incomeElement = document.querySelector('.income')
    this.expenseElement = document.querySelector('.expense')
    this.onAddButtonClickedProxy = this.onAddButtonClicked.bind(this)
    this.onValueChangeProxy = this.onValueChange.bind(this)
    this.addEventListeners()
    this.updateAccounts()
    this.updateCateories()
  }
  updateAccounts() {
    this.accounts = Object.keys(asafonov.accounts.getList())
  }
  updateCateories() {
    this.categories = asafonov.settings.getItem('categories')
  }
  addEventListeners() {
    this.updateEventListeners(true)
  }
  removeEventListeners() {
    this.updateEventListeners()
  }
  updateEventListeners (add) {
    this.addButton[add ? 'addEventListener' : 'removeEventListener']('click', this.onAddButtonClickedProxy)
    asafonov.messageBus[add ? 'subscribe' : 'unsubscribe'](asafonov.events.TRANSACTION_UPDATED, this, 'onTransactionUpdated')
  }
  onTransactionUpdated (event) {
    this.renderItem (event.to, event.id)
    this.updateTotal()
  }
  onAddButtonClicked() {
    this.model.add(
      (new Date()).toISOString().substr(0, 10),
      asafonov.accounts.getDefault(),
      0,
      'Point of sale',
      'Groceries'
    )
  }
  updateTotal() {
    if (! this.isReviewEnabled) return
    this.incomeElement.innerHTML = asafonov.utils.displayMoney(this.model.income())
    this.expenseElement.innerHTML = asafonov.utils.displayMoney(this.model.expense())
  }
  clearExistingItems() {
    const items = this.listElement.querySelectorAll('.item')
    for (let i = 0; i < items.length; ++i) {
      this.listElement.removeChild(items[i])
    }
  }
  genItemId (id) {
    return `item_${id}`
  }
  onValueChange (event) {
    const value = event.currentTarget.value || event.currentTarget.innerText
    const name = event.currentTarget.getAttribute('data-name')
    let el = event.currentTarget
    let id
    while (!id) {
      el = el.parentNode
      id = el.getAttribute('data-id')
    }
    const data = this.model.getItem(id)
    if (data[name] !== value) {
      const newData = {}
      newData[name] = value
      this.model.updateItem(id, newData)
    }
  }
  renderItem (item, i) {
    const itemId = this.genItemId(i)
    let itemDiv = this.listElement.querySelector(`#${itemId}`)
    let itemAdded = true
    if (! itemDiv) {
      itemDiv = document.createElement('div')
      itemDiv.className = 'section_row transaction item'
      itemDiv.setAttribute('data-id', i)
      itemDiv.id = itemId
      itemAdded = false
    }
    itemDiv.innerHTML = ''
    const col1 = document.createElement('div')
    col1.className = 'transaction_coll'
    const dateEl = document.createElement('input')
    dateEl.value = item.date
    dateEl.setAttribute('type', 'date')
    dateEl.setAttribute('data-name', 'date')
    dateEl.addEventListener('change', this.onValueChangeProxy)
    col1.appendChild(dateEl)
    const posDiv = document.createElement('div')
    const posInput = document.createElement('input')
    posInput.value = item.pos
    posInput.setAttribute('data-name', 'pos')
    posInput.setAttribute('size', '1')
    posInput.addEventListener('change', this.onValueChangeProxy)
    posDiv.appendChild(posInput)
    col1.appendChild(posDiv)
    itemDiv.appendChild(col1)
    const col2 = document.createElement('div')
    col2.className = 'transaction_coll'
    const accountEl = document.createElement('select')
    for (let i = 0; i < this.accounts.length; ++i) {
      const opt = document.createElement('option')
      opt.value = this.accounts[i]
      opt.text = this.accounts[i]
      this.accounts[i] === item.account && (opt.setAttribute('selected', true))
      accountEl.appendChild(opt)
    }
    accountEl.setAttribute('data-name', 'account')
    accountEl.addEventListener('change', this.onValueChangeProxy)
    col2.appendChild(accountEl)
    const categoryEl = document.createElement('select')
    for (let i = 0; i < this.categories.length; ++i) {
      const opt = document.createElement('option')
      opt.value = this.categories[i]
      opt.text = this.categories[i]
      this.categories[i] === item.tag && (opt.setAttribute('selected', true))
      categoryEl.appendChild(opt)
    }
    categoryEl.setAttribute('data-name', 'tag')
    categoryEl.addEventListener('change', this.onValueChangeProxy)
    col2.appendChild(categoryEl)
    itemDiv.appendChild(col2)
    const col3 = document.createElement('div')
    col3.className = 'transaction_coll'
    const amountEl = document.createElement('p')
    amountEl.className = 'number'
    amountEl.setAttribute('contenteditable', true)
    amountEl.setAttribute('data-name', 'amount')
    amountEl.innerHTML = asafonov.utils.displayMoney(item.amount)
    amountEl.addEventListener('focus', event => event.currentTarget.setAttribute('data-content', event.currentTarget.innerText.replace(/\n/g, '')))
    amountEl.addEventListener('blur', this.onValueChangeProxy)
    col3.appendChild(amountEl)
    itemDiv.appendChild(col3)
    if (! itemAdded && !! this.headerElement) this.headerElement.after(itemDiv)
  }
  updateList() {
    this.clearExistingItems()
    this.updateTotal()
    const list = this.model.getList()
    for (let i = 0; i < list.length; ++i) {
      this.renderItem(list[i], i)
    }
  }
  destroy() {
    this.removeEventListeners()
    this.model.destroy()
    this.addButton = null
    this.listElement = null
    this.incomeElement = null
    this.expenseElement = null
    this.reviewElement = null
  }
}
class UpdaterView {
  constructor (upstreamVersionUrl, updateUrl) {
    this.model = new Updater(upstreamVersionUrl)
    this.updateUrl = updateUrl
  }
  showUpdateDialogIfNeeded() {
    this.model.isUpdateNeeded()
      .then(isUpdateNeeded => {
        if (isUpdateNeeded) this.showUpdateDialog()
      })
  }
  showUpdateDialog() {
    if (confirm('New version available. Do you want to update the App?')) location.href = this.model.getUpdateUrl(this.updateUrl)
  }
}
window.asafonov = {}
window.asafonov.version = '2.0'
window.asafonov.utils = new Utils()
window.asafonov.messageBus = new MessageBus()
window.asafonov.events = {
  ACCOUNT_UPDATED: 'accountUpdated',
  ACCOUNT_RENAMED: 'accountRenamed',
  TRANSACTION_UPDATED: 'transactionUpdated',
  BUDGET_UPDATED: 'budgetUpdated',
  BUDGET_RENAMED: 'budgetRenamed',
  TRANSACTIONS_LOADED: 'transactionsLoaded'
}
window.asafonov.settings = {
}
window.onerror = (msg, url, line) => {
  alert(`${msg} on line ${line}`)
}
document.addEventListener("DOMContentLoaded", function (event) {
  function getPageName() {
    return document.querySelector('body').id || 'main_page'
  }

  const loader = {
    main_page: async () => {
      asafonov.settings = new Settings()
      await asafonov.settings.initCurrencyRates()
      const updaterView = new UpdaterView('https://raw.githubusercontent.com/asafonov/monly/master/VERSION.txt', 'https://github.com/asafonov/monly.apk/releases/download/{VERSION}/app-release.apk')
      updaterView.showUpdateDialogIfNeeded()
      asafonov.accounts = new Accounts()
      const accountsController = new AccountsController()
      const accountsView = new AccountsView()
      accountsView.updateList()
      const budgetsView = new BudgetsView()
      budgetsView.updateList()
      const transactionsView = new TransactionsView()
      transactionsView.updateList()
      const reportsController = new ReportsController()
      reportsController.build()
    },
    charts_page: async () => {
      asafonov.settings = new Settings()
      await asafonov.settings.initCurrencyRates()
      const reportsView = new ReportsView()
      reportsView.show()
    },
    settings_page: async () => {
      asafonov.settings = new Settings()
      asafonov.accounts = new Accounts()
      const settingsView = new SettingsView()
      settingsView.show()
      const backupView = new BackupView()
    }
  }

  loader[getPageName()]()
})
