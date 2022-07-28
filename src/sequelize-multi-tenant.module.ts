import {
    DynamicModule,
    Global,
    Inject,
    Module,
    OnApplicationShutdown,
    Provider,
    Type,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { defer, lastValueFrom } from 'rxjs';
import { Sequelize, SequelizeOptions } from 'sequelize-typescript';
import {
    generateString,
    getConnectionToken, handleRetry,
    SequelizeModuleAsyncOptions,
    SequelizeModuleOptions, SequelizeOptionsFactory
} from "@nestjs/sequelize";
import {
    DEFAULT_CONNECTION_NAME,
    SEQUELIZE_MODULE_ID,
    SEQUELIZE_MODULE_OPTIONS
} from "@nestjs/sequelize/dist/sequelize.constants";
import {EntitiesMetadataStorage} from "@nestjs/sequelize/dist/entities-metadata.storage";



@Global()
@Module({})
export class SequelizeMultiTenantModule implements OnApplicationShutdown {
    constructor(
        @Inject(SEQUELIZE_MODULE_OPTIONS)
        private readonly options: SequelizeModuleOptions,
        private readonly moduleRef: ModuleRef,
    ) {}

    static forRoot(options: SequelizeModuleOptions = {}): DynamicModule {
        const sequelizeModuleOptions = {
            provide: SEQUELIZE_MODULE_OPTIONS,
            useValue: options,
        };
        const connectionProvider = {
            provide: getConnectionToken(options as SequelizeOptions) as string,
            useFactory: async () => await this.createConnectionFactory(options),
        };

        return {
            module: SequelizeMultiTenantModule,
            providers: [connectionProvider, sequelizeModuleOptions],
            exports: [connectionProvider],
        };
    }

    static forRootAsync(options: SequelizeModuleAsyncOptions): DynamicModule {
        const connectionProvider = {
            provide: getConnectionToken(options as SequelizeOptions) as string,
            useFactory: async (sequelizeOptions: SequelizeModuleOptions) => {
                if (options.name) {
                    return await this.createConnectionFactory({
                        ...sequelizeOptions,
                        name: options.name,
                    });
                }
                return await this.createConnectionFactory(sequelizeOptions);
            },
            inject: [SEQUELIZE_MODULE_OPTIONS],
        };

        const asyncProviders = this.createAsyncProviders(options);
        return {
            module: SequelizeMultiTenantModule,
            imports: options.imports,
            providers: [
                ...asyncProviders,
                connectionProvider,
                {
                    provide: SEQUELIZE_MODULE_ID,
                    useValue: generateString(),
                },
            ],
            exports: [connectionProvider],
        };
    }

    async onApplicationShutdown() {
        const connection = this.moduleRef.get<Sequelize>(
            getConnectionToken(this.options as SequelizeOptions) as Type<Sequelize>,
        );
        
        connection && (await connection.close());
    }

    private static createAsyncProviders(
        options: SequelizeModuleAsyncOptions,
    ): Provider[] {
        if (options.useExisting || options.useFactory) {
            return [this.createAsyncOptionsProvider(options)];
        }
        const useClass = options.useClass as Type<SequelizeOptionsFactory>;
        return [
            this.createAsyncOptionsProvider(options),
            {
                provide: useClass,
                useClass,
            },
        ];
    }

    private static createAsyncOptionsProvider(
        options: SequelizeModuleAsyncOptions,
    ): Provider {
        if (options.useFactory) {
            return {
                provide: SEQUELIZE_MODULE_OPTIONS,
                useFactory: options.useFactory,
                inject: options.inject || [],
            };
        }
        // `as Type<SequelizeOptionsFactory>` is a workaround for microsoft/TypeScript#31603
        const inject = [
            (options.useClass ||
                options.useExisting) as Type<SequelizeOptionsFactory>,
        ];
        return {
            provide: SEQUELIZE_MODULE_OPTIONS,
            useFactory: async (optionsFactory: SequelizeOptionsFactory) =>
                await optionsFactory.createSequelizeOptions(options.name),
            inject,
        };
    }
    
    private static connections = new Map<string,Sequelize>();
    private static async createConnectionFactory(
        options: SequelizeModuleOptions,
    ): Promise<Sequelize> {
        return lastValueFrom(
            defer(async () => {
                let sequelize:Sequelize = undefined;
                const connectionKey = options?.database || DEFAULT_CONNECTION_NAME;

                const existingConnection = SequelizeMultiTenantModule.connections.get(connectionKey);
                if (existingConnection) {
                    try {
                        await existingConnection.authenticate();
                        sequelize = existingConnection;
                    } catch (e) {
                        SequelizeMultiTenantModule.connections.delete(connectionKey);
                        await existingConnection.close();
                        sequelize =options?.uri ? new Sequelize(options.uri, options) : new Sequelize(options);
                    }
                }else{
                    sequelize =options?.uri ? new Sequelize(options.uri, options) : new Sequelize(options);
                }

                if (!options.autoLoadModels) {
                    return sequelize;
                }

                const connectionToken = options.name || DEFAULT_CONNECTION_NAME;
                const models = EntitiesMetadataStorage.getEntitiesByConnection(connectionToken);
                sequelize.addModels(models as any);
                //some change
                await sequelize.authenticate();

                if (typeof options.synchronize === 'undefined' || options.synchronize) {
                    await sequelize.sync(options.sync);
                }
                SequelizeMultiTenantModule.connections.set(connectionKey, sequelize);
                return sequelize;
            }).pipe(handleRetry(options.retryAttempts, options.retryDelay))
        );
    }
}