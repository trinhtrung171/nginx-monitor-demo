import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

// Khởi tạo bộ thu thập dữ liệu OpenTelemetry
const sdk = new NodeSDK({
  // Tự động phát hiện và thu thập các chỉ số mặc định (RAM, CPU, API request)
  instrumentations: [
    getNodeAutoInstrumentations({
      // Tắt tự động đo đạc runtime của Node để tránh lỗi v8.getHeapSpaceStatistics trên Bun
      '@opentelemetry/instrumentation-runtime-node': {
        enabled: false,
      },
    }),
  ],
  // Cấu hình đẩy dữ liệu về Grafana Cloud qua giao thức OTLP
  metricReaders: [
    new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT
          ? (process.env.OTEL_EXPORTER_OTLP_ENDPOINT.endsWith('/v1/metrics') 
              ? process.env.OTEL_EXPORTER_OTLP_ENDPOINT 
              : `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/metrics`)
          : 'http://localhost:4318/v1/metrics',
        headers: process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.includes('otel-collector')
          ? {}
          : undefined
      }),
    }),
  ],
});

// Kích hoạt hệ thống
sdk.start();

console.log("📊 OpenTelemetry Monitoring đã được kích hoạt thành công!");
