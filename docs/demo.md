# Building

```bash
git clone https://github.com/plasne/Multi-Service-Availability msa

registry="<registry>"

docker build -t $registry/msa/wfe:latest -t $registry/msa/wfe:1.0.0 msa/demo/wfe/.
docker build -t $registry/msa/app:latest -t $registry/msa/app:1.0.0 msa/demo/app/.
docker build -f msa/demo/db/demo.east.Dockerfile -t $registry/msa/db:latest -t $registry/msa/db:1.0.0 msa/demo/db/.
docker build -f msa/demo.east.Dockerfile -t $registry/msa/agent:latest -t $registry/msa/agent:1.0.0 msa/.

docker login $registry -u <username> -p <password>
docker tag msa/app $registry/msa/app
docker push $registry/msa/app
docker tag msa/wfe $registry/msa/wfe
docker push $registry/msa/wfe
docker tag msa/agent $registry/msa/agent
docker push $registry/msa/agent

# to verify
curl https://<registry>/v2/_catalog

docker network create -d overlay --attachable mynetwork
docker service create --replicas 3 --name app --network mynetwork --with-registry-auth $registry/msa/app:latest
docker service create --replicas 3 --name wfe --network mynetwork --publish 80:80 --with-registry-auth $registry/msa/wfe:latest
docker service create --replicas 3 --name msa --network mynetwork --publish 200:80 --with-registry-auth $registry/msa/agent:latest
```
