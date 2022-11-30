import { Resource } from "@opentelemetry/resources"
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions"
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node"
import { registerInstrumentations } from "@opentelemetry/instrumentation"
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"

export type TracingOptions = {
  appName: string
  appVersion: string
}

export const init = (tracingOpts: TracingOptions) => {

  registerInstrumentations({});

  const resource =
    Resource.default().merge(
      new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: tracingOpts.appName,
        [SemanticResourceAttributes.SERVICE_VERSION]: tracingOpts.appVersion,
      })
    );


  const provider = new NodeTracerProvider({
    resource: resource,
  });

  const otlpExporter = new OTLPTraceExporter({})
  const zipkinProcessor = new BatchSpanProcessor(otlpExporter);
  provider.addSpanProcessor(zipkinProcessor)

  provider.register();
}

