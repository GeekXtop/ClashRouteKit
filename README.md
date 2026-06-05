# ClashRouteKit

模块化维护 OpenClash / Clash Meta 路由规则、SubConverter INI 和 Clash rule-provider 的本地工具。

本项目的核心思路是自己声明策略组、规则模块和规则顺序，不再把 Aethersailor、ACL4SSR 或 dler 的 INI 当主模板继承。第三方项目只作为数据源：GEOSITE tag、Clash list、Clash provider YAML 或 domain-list-community data。

## 产出与发布

- `output/templates/Custom_Clash.ini`：给 SubConverter-Extended 使用的 INI。
- `output/rules/*.yaml`：INI 引用的 Clash rule-provider。

`output/` 不提交到 `main`，但会由 GitHub Actions 生成并发布到 `publish` 分支。最终公开产物 URL：

```text
https://raw.githubusercontent.com/<owner>/<repo>/publish/templates/Custom_Clash.ini
https://raw.githubusercontent.com/<owner>/<repo>/publish/rules/Developer_Domain.yaml
```

不提交到 `main`：订阅链接、最终 `config.yaml`、`output/`、`vendor/`、`dist/`、provider 缓存、`.mrs`、本地环境文件。

最终 `config.yaml` 仍由本地 SubConverter-Extended 生成，再导入 OpenClash。

## publishBaseUrl

`publishBaseUrl` 是生成到 INI 里的 rule-provider 访问根地址。脚本会把它拼成：

```text
<publishBaseUrl>/rules/<provider>.yaml
```

本地默认值：

```text
http://127.0.0.1:8787
```

这表示先运行：

```powershell
pnpm generate
pnpm serve:output
```

然后本机 SubConverter 可以访问：

```text
http://127.0.0.1:8787/templates/Custom_Clash.ini
http://127.0.0.1:8787/rules/Developer_Domain.yaml
```

注意：如果 SubConverter 或 OpenClash 跑在路由器上，`127.0.0.1` 指的是路由器自己，不是你的电脑。此时要把 `publishBaseUrl` 改成电脑的 LAN 地址，例如 `http://192.168.1.10:8787`，或者改成 GitHub/raw/CDN 等公开地址。

GitHub Actions 发布时不会使用本地默认值，而是通过环境变量覆盖为：

```text
https://raw.githubusercontent.com/${{ github.repository }}/publish
```

因此 `publish` 分支里的 INI 会引用同一分支下的 `rules/*.yaml`。

## 数据流

```text
config/modules.yaml
  + config/rules/*.list
  + domain-list-community/data/*
  + ACL4SSR/Clash/Ruleset/*.list
  + Rules/Clash/Provider/*.yaml
  -> output/templates/Custom_Clash.ini
  -> output/rules/*.yaml
```

`config/modules.yaml` 是唯一生效配置，控制：

- `proxyGroups`：SubConverter `custom_proxy_group`。
- `modules`：规则模块和优先级，数组顺序就是规则顺序。
- `ruleProviders`：从本地/第三方真实数据生成 provider YAML。
- `final.policy`：漏网之鱼策略；当前是 `Proxy`。

默认规则顺序：

```text
private -> Direct
custom-direct -> Direct
custom-proxy -> Proxy
ai -> AI
developer -> Tech
crypto -> Crypto
microsoft -> Microsoft
global-proxy/geolocation-!cn -> Proxy
china/geolocation-cn/cn/geoip-cn -> Direct
FINAL -> Proxy
```

## 真实数据源

当前默认配置在 CI 中引用 `vendor/` 里的上游 checkout：

- `vendor/domain-list-community/data`：DLC tag，例如 `github`、`debian`、`ubuntu`、`openai`。
- `vendor/ACL4SSR/Clash/Ruleset/Developer.list`：Developer 补充列表。
- `vendor/Rules/Clash/Provider/AI Suite.yaml`：AI provider。
- `vendor/Rules/Clash/Provider/Crypto.yaml`：Crypto provider。
- `vendor/Rules/Clash/Provider/Microsoft.yaml`：Microsoft provider。

本地不需要复制一份 `vendor/`，可以直接用你已经下载的上游仓库：

```powershell
$env:CLASH_ROUTE_KIT_DLC_DATA = "E:\Developer\Github-GeekXtop\domain-list-community\data"
$env:CLASH_ROUTE_KIT_ACL4SSR_ROOT = "E:\Developer\Github-GeekXtop\ACL4SSR"
$env:CLASH_ROUTE_KIT_RULES_ROOT = "E:\Developer\Github-GeekXtop\Rules"
pnpm generate
```

如果这些环境变量不存在，CLI 会回退到 `config/modules.yaml` 中声明的 `basePath`。

支持的 source 类型：

- `clash-list`：读取 `DOMAIN-SUFFIX,example.com` 这类 `.list`。
- `clash-provider`：读取 Clash provider YAML 的 `payload`。
- `domain-list-community`：读取本地 domain-list-community data 文件，并展开 `include:`。

生成 domain provider 时只保留 `DOMAIN-SUFFIX` 和 `DOMAIN`。`DOMAIN-KEYWORD`、`IP-CIDR`、`PROCESS-NAME` 等不会进入 domain provider。

## 命令

```powershell
pnpm install
pnpm test
pnpm typecheck
pnpm build
pnpm check
pnpm preview
pnpm generate
pnpm serve:output
pnpm dev
```

常用流程：

```powershell
pnpm check
pnpm preview
pnpm generate
pnpm serve:output
```

Web 控制台：

```powershell
pnpm dev
```

## GitHub Actions

`Publish Generated Files` 会在 `main` 分支相关文件变更时自动触发，也可以手动触发。

流程：

```text
checkout project
checkout v2fly/domain-list-community -> vendor/domain-list-community
checkout ACL4SSR/ACL4SSR -> vendor/ACL4SSR
checkout dler-io/Rules -> vendor/Rules
pnpm test/typecheck/build/check
CLASH_ROUTE_KIT_PUBLISH_BASE_URL=https://raw.githubusercontent.com/<owner>/<repo>/publish pnpm generate
publish output/ -> publish branch
```

## 目录

```text
config/modules.yaml          项目生成声明
config/rules/                手写规则源
packages/core/               INI 渲染、DLC 转换、provider 生成和共享类型
apps/cli/                    generate/preview/check 命令
apps/web/                    React/Vite 本地控制台
output/                      本地生成产物，已忽略
vendor/                      预留上游缓存目录，已忽略
```

## 约定

- 不提交订阅链接和最终 `config.yaml`。
- 不生成 `.mrs`。
- 不把第三方 INI 当主模板 patch。
- 规则数据优先写进 `config/modules.yaml` 和 `config/rules/`，不要硬编码到应用代码。
- 改 schema 或生成逻辑后运行 `pnpm test`、`pnpm typecheck`、`pnpm build`。
