FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build

WORKDIR /src

COPY api-new-kpi.csproj ./
RUN dotnet restore

COPY . ./
RUN dotnet publish api-new-kpi.csproj \
    --configuration Release \
    --output /app/publish \
    /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime

WORKDIR /app

ENV ASPNETCORE_URLS=http://+:8080
ENV DOTNET_EnableDiagnostics=0

COPY --from=build /app/publish ./

EXPOSE 8080

ENTRYPOINT ["dotnet", "api-new-kpi.dll"]
