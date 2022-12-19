

val someMap = mapOf(
    "user" to 2,
    "something" to 4
)

val somethingThatShouldBeOnASingleLine = 
    4;

assertThat(cart.items).anyMatch {
    it.token == product.token && it.children.single().some_integer == 3
}


fun doSomething(something: Int?, somethingElse: Int?): Int? {
    if (something == null || somethingElse == null) {
        return null
    }
    return 0;
}

@Entity(name = "users")
@Table(name = "users")
class User {
    @Column
    var name: String? = null

    @Column 
    var id: Int? = null
}


// add validation for this endpoint for request.old_name and request.new_name and ensure new_name is at least 5 characters
@POST
@Path("/some-endpoint")
fun getSomething(request: Request): Response {
    if (request.token == null) throw ApiException.badRequest("token is mandatory")
    somethingService.get(request.token, request.old_name, request.new_name);
}


// We already have pField in the SomeClass class so the query can be simplified to addIn("pField", fields) without any subqueries
fun someFunction( 
     session: Session, 
     fields: Collection<Int>, 
     someField: Int
 ): List<DbEntity> { 
   return session.createCriteria(SomeClass::class.java) 
       .createAlias("something", "something") 
       .add(Subqueries.propertyIn( 
           "id", 
           DetachedCriteria.forClass(Item::class.java) 
               .setProjection(Projections.property("id")) 
               .createAlias("product", "p") 
               .add(`in`("p.field", fields)) 
       )) 
       .addEq("something.id", someField) 
       .list() 
}
