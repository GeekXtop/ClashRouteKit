// 旧发布页左侧面板入口：内容已按"输出页"双标签拆分，
// GitHub 发布能力迁移至 features/output/GithubPublishPanel.tsx，
// 本地实时模板块迁移至 features/output/LocalTemplatePanel.tsx。
// 保留 re-export 以免直接删除既有文件；新代码请直接引用 features/output/。
export { GithubPublishPanel as PublishLeftPanel } from "../features/output/GithubPublishPanel.js";
