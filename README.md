# ClashRouteKit

模块化维护 OpenClash / Clash Meta 路由规则、SubConverter INI 和 Clash rule-provider 的本地工具。

本项目的核心思路是直接声明 SubConverter 的 `ruleset` 与 `custom_proxy_group`，不再把 Aethersailor、ACL4SSR 或 dler 的 INI 当主模板继承。第三方项目只作为数据源：GEOSITE tag、Clash list、Clash provider YAML 或 domain-list-community data。

## 本地优先使用方式

ClashRouteKit 适合作为自己的 GitHub 仓库模板使用。

1. Fork 本仓库，或从模板创建自己的仓库。
2. 将自己的仓库 clone 到本地。
3. 运行 `pnpm install` 安装依赖。
4. 运行 `pnpm dev` 启动本地 Web 编辑器。
5. 在 Web UI 中编辑 RuleSets、Custom Proxy Groups、rule provider 和规则文件。
6. 点击 `保存配置`，再依次运行 `运行检查`、`生成输出`、`Git 状态`、`提交配置` 和 `推送发布`。
7. 等待 GitHub Actions 发布 `publish` 分支。

发布后的文件地址：

```text
https://raw.githubusercontent.com/<owner>/<repo>/publish/templates/Custom_Clash.ini
https://raw.githubusercontent.com/<owner>/<repo>/publish/rules/<Provider_File>.yaml
```

Web UI 不需要 GitHub OAuth，也不会在浏览器保存 GitHub token。它通过本地 dev server 写入当前 checkout 中的固定文件，并依赖本机 Git 凭据执行 `git push`。

默认使用方式不需要 Docker。Docker 或 devcontainer 只适合作为可选开发环境，不是本项目的发布路径。

## 产出与发布

- `output/templates/Custom_Clash.ini`：给 SubConverter-Extended 使用的 INI。
- `output/rules/*.yaml`：INI 引用的 Clash rule-provider。

`output/` 不提交到 `main`，但会由 GitHub Actions 生成并发布到 `publish` 分支。最终公开产物 URL：

```text
https://raw.githubusercontent.com/GeekXtop/ClashRouteKit/publish/templates/Custom_Clash.ini
https://raw.githubusercontent.com/GeekXtop/ClashRouteKit/publish/rules/Developer_Domain.yaml
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
config/routes.yaml
  + config/rules/*.list
  + domain-list-community/data/*
  + ACL4SSR/Clash/Ruleset/*.list
  + Rules/Clash/Provider/*.yaml
  -> output/templates/Custom_Clash.ini
  -> output/rules/*.yaml
```

`config/routes.yaml` 是唯一生效配置，控制：

- `customProxyGroups`：每一项输出为一条 SubConverter `custom_proxy_group=...`。
- `ruleSets`：每一项输出为一条 SubConverter `ruleset=...`，数组顺序就是规则顺序。
- `ruleProviders`：从本地/第三方真实数据生成 provider YAML。

旧版 `config/modules.yaml`、`modules` 和 `proxyGroups` 不再作为默认配置或兼容输入。

## INI 模型

SubConverter INI 里本项目主要生成两块内容：

- `ruleSets`：决定“什么流量进哪个 custom_proxy_group”。例如 Developer 域名进 `Tech`，`geolocation-!cn` 进 `Proxy`，`FINAL` 进 `Proxy`。
- `customProxyGroups`：决定“custom_proxy_group 里面有哪些可选节点或下级策略”。例如 `Tech` 可以选 `Proxy` / `Auto` / `Direct`。

这两块应该分开维护。`ruleSets` 不直接关心具体节点；它只把流量导向一个 custom_proxy_group。节点怎么组织由 `customProxyGroups` 负责。

节点分组可以有几种模式：

- 不细分：直接让 `Proxy` / `Auto` 使用订阅里的全部节点过滤器 `.*`。
- 按用途分组：`AI`、`Tech`、`Crypto`、`Microsoft` 这类策略组再指向 `Proxy` / `Auto` / `Direct`。
- 按地区分组：新增 `HK`、`TW`、`JP`、`US`、`SG` 等策略组，用节点正则筛选地区。
- 双重分组：用途组先选地区组，例如 `AI -> US/JP/Proxy/Direct`，地区组再筛选具体节点。
- 订阅自带分组：如果订阅转换后的节点名或 provider 已经带分组，也可以尽量少建本地地区组，只保留用途策略。

当前实现只支持在 `custom_proxy_group` 里写静态 `options` 和 `nodeFilters`，还没有完整的“按地区自动生成节点组”能力。

默认规则顺序：

```text
private-geosite-private -> Direct
custom-direct-provider-custom-direct-domain -> Direct
custom-proxy-provider-custom-proxy-domain -> Proxy
ai-* -> AI
developer-* -> Tech
crypto-* -> Crypto
microsoft-* -> Microsoft
global-proxy-geosite-geolocation-not-cn -> Proxy
china-* -> Direct
final -> 🐟 漏网之鱼
```

## 真实数据源

`pnpm sync:vendor` 从 `config/routes.yaml` 顶层 `vendorRepos` 读取要同步的上游仓库。当前配置声明：

- `vendor/domain-list-community`：DLC tag，例如 `github`、`debian`、`ubuntu`、`openai`。
- `vendor/ACL4SSR`：Developer 补充列表。
- `vendor/Rules`：AI、Crypto、Microsoft provider。

本地使用当前项目自己的 `vendor/` 缓存，不依赖旁边已有 clone：

```powershell
pnpm sync:vendor
pnpm generate
```

`vendor/` 是 ignored 缓存目录，不提交到 `main`。CI 也会运行同一个 `pnpm sync:vendor`。

支持的 source 类型：

- `clash-list`：读取 `DOMAIN-SUFFIX,example.com` 这类 `.list`。
- `clash-provider`：读取 Clash provider YAML 的 `payload`。
- `domain-list-community`：读取本地 domain-list-community data 文件，并展开 `include:`。

生成 domain provider 时只保留 `DOMAIN-SUFFIX` 和 `DOMAIN`。`DOMAIN-KEYWORD`、`IP-CIDR`、`PROCESS-NAME` 等不会进入 domain provider。

provider 可以在合并全部 source 后排除不想输出的域名规则：

```yaml
ruleProviders:
  - name: Developer
    output: Developer_Domain.yaml
    behavior: domain
    exclude:
      - tracker.example
    remove:
      - DOMAIN,api.example
    sources:
      - name: LocalDeveloper
        type: clash-list
        path: config/rules/Developer_Domain.list
```

`exclude` 是主配置名，`remove` 是兼容别名。裸域名按 `DOMAIN-SUFFIX` 处理；`DOMAIN,example.com` 只排除精确域名。

`pnpm generate` 会为每个 provider 输出 summary：

```text
[generate] summary: Developer output=1200 domain=1205 excluded=5 sources=[LocalDeveloper:10/10, DLC_github:300/300]
[generate] duplicates: providers=2 rules=45
[generate] overlaps: rules=8
[generate] report: E:\Developer\Solutions\ClashRouteKit\output\reports\rule-report.json
```

`sourceName:domain/input` 中，`input` 是 source 读取到的原始规则条数，`domain` 是能进入 domain provider 的去重后 `DOMAIN-SUFFIX` / `DOMAIN` 条数。

如果同一个 provider 的多个 source 贡献了同一条 domain 规则，报告会写入 `duplicates`；如果多个 provider 最终输出了同一条 domain 规则，报告会写入 `overlaps`。

## 命令

```powershell
pnpm install
pnpm test
pnpm typecheck
pnpm build
pnpm check
pnpm preview
pnpm sync:vendor
pnpm generate
pnpm serve:output
pnpm dev
```

常用流程：

```powershell
pnpm check
pnpm preview
pnpm sync:vendor
pnpm generate
pnpm subconvert-url
pnpm serve:output
```

如果本地已经同步 `vendor/domain-list-community/data`，`pnpm check` 会同时校验 `ruleSets[].source.type: geosite` 引用的 tag 是否存在；未同步 vendor 时会跳过这项检查。

生成 SubConverter 调用 URL：

```powershell
$env:CLASH_ROUTE_KIT_SUBSCRIPTION_URL="https://example.com/your-subscription"
$env:CLASH_ROUTE_KIT_PUBLISH_BASE_URL="https://raw.githubusercontent.com/GeekXtop/ClashRouteKit/publish"
pnpm subconvert-url
```

默认 SubConverter endpoint 是 `http://127.0.0.1:25500/sub`，可用 `CLASH_ROUTE_KIT_SUBCONVERTER_BASE_URL` 覆盖。订阅 URL 只从环境变量读取，不写入仓库配置。
`CLASH_ROUTE_KIT_SUBCONVERTER_BASE_URL` 可以写完整 URL，例如 `http://10.0.0.3:25500/sub`，也可以只写 host:port，例如 `10.0.0.3:25500`。

Web 控制台：

```powershell
pnpm dev
```

## GitHub Actions

`Publish Generated Files` 会在 `main` 分支相关文件变更时自动触发，也可以手动触发。

流程：

```text
checkout project
pnpm sync:vendor
pnpm test/typecheck/build/check
CLASH_ROUTE_KIT_PUBLISH_BASE_URL=https://raw.githubusercontent.com/GeekXtop/ClashRouteKit/publish pnpm generate
publish output/ -> publish branch
```

## 目录

```text
config/routes.yaml           项目生成声明
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
- 规则数据优先写进 `config/routes.yaml` 和 `config/rules/`，不要硬编码到应用代码。
- 改 schema 或生成逻辑后运行 `pnpm test`、`pnpm typecheck`、`pnpm build`。
