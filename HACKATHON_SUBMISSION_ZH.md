# Agent Revenue Passport — 中文参赛材料说明

> 正式提交建议使用 `HACKATHON_SUBMISSION.md` 的英文版本。本文件帮助项目成员核对意思，不建议把中英文全部塞进表单。

## 项目名称

Agent Revenue Passport

## 一句话介绍

Agent Revenue Passport 将带有买方签名的链上结算整理成可携带的 AI Agent 收入信用档案，并由 GenLayer 给出最终的欺诈判断。

## 完整项目说明

钱包里有资金流入，不等于 AI Agent 真的从独立客户那里赚到了钱。运营方可能在有关联的钱包之间转钱，而真实业务收入也可能被埋在大量普通转账里。

Agent Revenue Passport 不从钱包余额出发，而是从业务结算证据出发。当前产品会索引 Base 上的 AntSeed 通道活动，只统计带有买方签名的结算。它会汇总 Agent 累计收入、付款钱包数量、收入是否过度集中于某一个付款方、已经结束的通道是否获得付款、AntSeed 是否记录过异常结算，以及主要付款钱包之间是否存在直接转账或共同资金来源。

三个数值指标由固定规则计算，同一份证据不会因为模型随机性而改变分数。系统再把压缩后的、带版本号的证据提交给已经部署的 GenLayer Intelligent Contract。GenLayer 验证者不会重新编造一套分数，而是独立回答一个范围明确的问题：这些事实是否足以支持“该收入存在欺诈行为”的判断？达成的结果与理由代码、引用钱包会写入链上。网站再把结果翻译成直接易懂的中文或英文。

当前公开产品支持 AntSeed 的 Base 结算。仓库里已经有通过本地测试的 GH Bounty / Solana 适配器，但它尚未接入公开验证流程，属于下一步功能。后续还可以为 OKX AI 和其他 Agent 市场增加明确的数据适配器，并继续使用 GenLayer 作为最终判断层。

## 当前链接

- 公开网站：`https://agent-revenue-passport.manshiguang124.chatgpt.site`
- GitHub：https://github.com/TJC-66/agent-revenue-passport
- GenLayer 合约：`0x0a85C6Dd93051d11775f4F8709d372e4f821a698`
- 部署交易：`0x4c86150c0a772e818fee99e91044a282d84be6514df4240499f8342eb11f9e43`
- 演示视频：待录制

## 提交流程

1. 点击“参加黑客松”只是报名，不会自动提交项目。
2. 完成网站、公开 GitHub、演示视频和表单文案后，进入单独的项目提交页面。
3. 上传 1024 × 1024 PNG Logo，填写网站、GitHub、YouTube 和 GenLayer 合约/交易链接。
4. 最后由用户亲自检查表单、完成验证码并提交。
