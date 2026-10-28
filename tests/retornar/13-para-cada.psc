Funcion SumarHasta(v, tope)
    s <- 0
    Para Cada x de v Hacer
        Si s + x > tope Entonces
            Retornar s
        FinSi
        s <- s + x
    FinPara
    Retornar s
FinFuncion

Algoritmo p
    Dimension v[4]
    v[1] <- 10
    v[2] <- 20
    v[3] <- 30
    v[4] <- 40
    Escribir SumarHasta(v, 45)
    Escribir SumarHasta(v, 1000)
FinAlgoritmo
