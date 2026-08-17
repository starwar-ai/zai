// onnxruntime-web 1.21.0 的 exports 未声明 types 条件；在 NodeNext 下补回其官方类型入口。
declare module "onnxruntime-web" {
  export * from "onnxruntime-common"
}
