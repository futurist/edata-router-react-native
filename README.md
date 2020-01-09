# edata-router

## 文件结构

File tree:

```
index.jsx          # 主入口
actions/          ＃ 接口动作(success/fail等)
├── index.js
├── products.js
└── users.js
```

## 主入口 index.jsx

```js
import React from 'react'
import EdataRouter from 'edata-router'
import {actions1, actions2} from './actions'

const app = new EdataRouter({
  ajaxConfig: {
    headers: {},
    beforeRequest: (init)=>{},
    getResponse: (response)=>response,
    afterResponse: (response)=>{},
    errorHandler: (error)=>{}
  }
})

// 导入接口配置
app.model(actions1)

const actions2ResourceDef = {
  getList: {
    url: '/analysis/api/products/cat/:id',
    method: 'GET',
  }
}
// 可选传入资源定义
app.model(actions2, actions2ResourceDef)
... ...

// 挂载运行
const run = app.run()

// Use
run.getAPIProps()
run.hoc()

run.props  // 包含所有的API
run.model  // 全局model
run.routes  // 全局routes配置
run.store  // 内部Redux Store
run.options  // 启动options


```


## 接口定义  (actions/)

### actions

每个模块都需导出如下结构：

```js
module.exports = {
    name: 'products',  // 必填
    store: {},
    actions: {
        getList: {
          url: '/analysis/api/products/cat/:id',
          method: 'GET',
          param: () => ({  //支持对象(静态配置)，函数(动态生成)
              workspaceCode: window.workspace
          }),
          callback: {
              start: function (store, init) {
              },
              success: function (store, result) {
              },
              fail: function (store, err) {
              }
          }
        },
        ... ...
    }
}
```

`Header`组件中，以下方法自动可用:

```js
this.props.products.getList(
  query,
  {
    id: 123
  }
)

this.props.products.store   // store是action中定义的那个对象

this.props.model  // model是一个edata
```
