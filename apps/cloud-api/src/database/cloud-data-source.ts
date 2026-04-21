import "reflect-metadata";
import { DataSource } from "typeorm";
import { buildCloudDataSourceOptions } from "./cloud-database.config";

const envReader = {
  get<T = string>(propertyPath: string): T | undefined {
    return process.env[propertyPath] as T | undefined;
  },
};

export default new DataSource(buildCloudDataSourceOptions(envReader));
