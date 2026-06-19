import { useEffect, useState } from "react";
import type { RouteKitProjectConfig } from "@clash-route-kit/core";
import type { ProjectValidationState } from "../projectController.js";
import { createRawUrlTemplates, fetchGitRemote, parseGitHubRemote } from "../publishWorkflow.js";
import { ConfigYamlSection } from "./ConfigYamlSection.js";
import { GitPublishSection } from "./GitPublishSection.js";
import { PublishTemplateSection } from "./PublishTemplateSection.js";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function PublishPage(props: {
  config: RouteKitProjectConfig;
  validation: ProjectValidationState;
  onRunCheck: () => void;
  fetcher?: Fetcher;
}) {
  const fetcher = props.fetcher ?? globalThis.fetch;
  const [rawTemplateUrl, setRawTemplateUrl] = useState<string | null>(null);
  const subconverterUrl = props.config.subconverterUrl ?? "http://10.0.0.3:25500/sub";

  useEffect(() => {
    props.onRunCheck();
    let alive = true;
    void fetchGitRemote(fetcher)
      .then((remote) => {
        const repo = parseGitHubRemote(remote);
        if (alive && repo) setRawTemplateUrl(createRawUrlTemplates(repo, props.config.template.output).template);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rk-publish-split">
      <div className="rk-pane rk-publish-col">
        <PublishTemplateSection
          templateOutput={props.config.template.output}
          publishBaseUrl={props.config.publishBaseUrl}
          validation={props.validation}
          onRunCheck={props.onRunCheck}
          fetcher={fetcher}
        />
        <GitPublishSection rawTemplateUrl={rawTemplateUrl} fetcher={fetcher} />
      </div>
      <div className="rk-pane rk-publish-col">
        <ConfigYamlSection
          publishBaseUrl={props.config.publishBaseUrl}
          templateOutput={props.config.template.output}
          subconverterUrl={subconverterUrl}
        />
      </div>
    </div>
  );
}
