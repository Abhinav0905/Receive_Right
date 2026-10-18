declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    AWS_BEARER_TOKEN_BEDROCK?: string;
    AWS_REGION?: string;
    BEDROCK_MODEL_ID?: string;
  }
}
