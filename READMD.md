# 托育知护

面向托育机构人员和婴幼儿照护者的知识问答产品。打开即可提问，回答依据资料库中的政策、标准和照护指南，并标明出处。使用者不需要安装模型，也不需要看到检索、向量或本机模型这些实现细节。

# 环境与安装

require Node.js 20+

安装

```
npm install
npm run dev
```

训练数据
```
npm run childcare
```

可以阅读[项目架构介绍文档](AI_AGENT_README.md)了解详情，知识库导入时需要格式化，所以推荐让agent做这部分工作

# 运行与部署

调试可以使用
```
npm run dev
```

生产虽然说也可以调试进行运行，但也可以部署好前端，然后手动运行后端内容
```
npm run build
npx tsx apps/server/src/index.ts
```

