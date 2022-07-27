<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo_text.svg" width="320" alt="Nest Logo" /></a>
</p>

<p align="center">
  <a href="https://www.paypal.com/donate/?hosted_button_id=77VNGKV9JCMQY"><img src="https://img.shields.io/badge/Donate-PayPal-dc3d53.svg"/></a>
</p>


## Installation

```bash
$ npm i --save @nestjs/sequelize sequelize-typescript sequelize sequelizemultitenantmodule
```

## Description

[Sequelize](https://sequelize.org/) module for [Nest](https://github.com/nestjs/nest). That supports pooled connections.
This module replaces the standard `SequelizeModule` with `SequelizeMultiTenantModule`


## How to use


```
@Injectable({scope:Scope.REQUEST})
export class SequelizeConfigService implements SequelizeOptionsFactory{
  // The intention is you can resolve the DB from the request header or using what ever strategy you prefer
  constructor(@Inject(REQUEST) private readonly request:RequestContext){}

  createSequelizeOptions(): SequelizeModuleOptions {
    //const dbName = this.request.dbName; 
    const database = 'postgres';
   
    return {
      dialect: DB_DIALECT, 
      host: DB_HOST,
      port: Number(DB_PORT),
      database: database,
      username: DB_USERNAME,
      password: DB_PASSWORD,
      autoLoadModels: true,
      synchronize: true,
    };
  }
}
```

```
SequelizeMultiTenantModule.forRootAsync({
    imports: [DatabaseConfigModule],
    useExisting: SequelizeConfigService,
}),
```

## License

[MIT licensed](LICENSE).